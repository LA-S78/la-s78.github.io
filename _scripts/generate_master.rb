require 'json'
require 'fileutils'
require_relative 'gemini_client' # call_gemini_api
require_relative 'guide_text_check' # GuideTextCheck: titles, subtitles and alt text left in English

$stdout.sync = true

GLOSSARY = JSON.parse(File.read('_data/terminology.json'))['enforced_terms']
LANGUAGES = ['en', 'de', 'es', 'fr', 'ru', 'tr', 'uk', 'it']

# The texts inside a guide's structure (section titles, which also label the nav tabs; the
# subtitle; pictures' alt text) that came back still in English get a second, small request
# with just those (owner request, 2026-11-17: German and Ukrainian kept the Kill Event's
# titles in English). Returns the fixed translation.
def fill_untranslated(english, translated, lang)
  todo = GuideTextCheck.untranslated(english, translated, lang, GLOSSARY)
  return translated if todo.empty?

  puts "--> #{todo.size} text(s) still in English in [#{lang}]: asking for just those"
  reply = call_gemini_api(GuideTextCheck.prompt(todo, lang, GLOSSARY), lang, json: true)
  answers = JSON.parse(reply.to_s.gsub(/\A```(?:json)?|```\z/, '').strip) rescue {}
  answers = answers.select { |k, v| todo.key?(k) && v.is_a?(String) && !v.strip.empty? }
  puts "--> filled #{answers.size} of #{todo.size}"
  GuideTextCheck.apply(translated, answers)
end

# --fill <id>: the same check for a guide already translated (_source/<id>.md), from the
# "Fill missing translations" workflow. Rewrites the file only if something was filled.
if (i = ARGV.index('--fill'))
  id = ARGV[i + 1].to_s
  abort 'Usage: ruby _scripts/generate_master.rb --fill <guide id>' unless id =~ /\A[a-z0-9_]+\z/
  path = "_source/#{id}.md"
  abort "No #{path}" unless File.exist?(path)

  master = File.read(path)
  english = GuideTextCheck.language_part(master, 'en')
  changed = false
  out = master.dup
  LANGUAGES.drop(1).each do |lang|
    part = GuideTextCheck.language_part(master, lang)
    next if part.empty?

    fixed = fill_untranslated(english, part, lang)
    next if fixed == part

    out = out.sub(part) { fixed }
    changed = true
    sleep(5)
  end
  if changed
    File.write(path, out)
    puts "✅ Filled missing translations in #{path}"
  else
    puts "Nothing left in English in #{path}"
  end
  exit
end

all_drafts = Dir.glob("_source/*_en.md")
files = all_drafts.empty? ? [] : [all_drafts.first]

files.each do |en_file|
  base_name = File.basename(en_file, "_en.md")
  full_content = File.read(en_file)

  # Check if this is a data source file or a regular guide file
  is_data_file = base_name.start_with?("data") || full_content.include?("<data")

  if is_data_file
    # --- DATA FILE TRANSLATION LOGIC ---
    full_master_file = ""

    LANGUAGES.each do |lang|
      puts "--> Processing Data File #{base_name} [Lang: #{lang}]"
      
      if lang == 'en'
        puts "--> Preserving English source..."
        full_master_file << full_content << "\n"
      else
        prompt = <<~PROMPT
          You are an expert localization engineer and YAML specialist. Translate the string values in the provided data file, preserving the exact XML schema and YAML structure.
          
          CRITICAL RULES:
          1. STRUCTURE SCHEMA: Preserve all <data lang="en" name="..."> tags. You MUST update the 'lang' attribute to '#{lang}' and keep the 'name' attribute identical.
          2. YAML KEYS: You are STRICTLY FORBIDDEN from changing or translating YAML keys (e.g., 'current_event', 'schedule_title', 'sb', 'rules', 'map', 'admin'). Keep keys 100% identical to English.
          3. STRING VALUES: Translate only the human-readable text values inside quotes. Keep variables like {day}, {rule}, {max} completely untouched.
          4. GLOSSARY: #{GLOSSARY.to_json}
          
          INPUT:
          #{full_content}
        PROMPT

        full_master_file << call_gemini_api(prompt, lang) << "\n"
        
        puts "--> Cooldown: Waiting 20s..."
        sleep(20)
      end
    end

    File.write("_source/#{base_name}.md", full_master_file)
    File.delete(en_file)
    puts "✅ Generated Data Master: #{base_name}.md"

  else
    # --- NON-DATA FILE (GUIDE) LOGIC ---
    is_legacy = full_content.include?("===")
    structure_instructions = is_legacy ? 
      "- Legacy Delimiters: Use '=== guide--[lang]--... ==='." :
      "- XML Schema: Use '<guide lang=\"#{LANGUAGES.join('|')}\" ...>' and '<pane lang=\"#{LANGUAGES.join('|')}\" ...>'."

    front_matter = ""
    body_content = full_content
    if full_content =~ /\A(---\s*\n.*?\n---\s*\n)/m
      front_matter = $1
      body_content = full_content.sub(front_matter, "")
    end

    full_master_file = ""

    LANGUAGES.each do |lang|
      puts "--> Processing Guide #{base_name} [Lang: #{lang}]"
      
      localized_front_matter = front_matter.dup
      localized_front_matter.gsub!(/^lang:\s*["']?en["']?/, "lang: \"#{lang}\"")
      
      if lang == 'en'
        puts "--> Preserving English source..."
        full_master_file << localized_front_matter << body_content << "\n"
      else
        prompt = <<~PROMPT
          You are an expert localization engineer. Translate the content, preserving the structural schema.
          
          CRITICAL RULES:
          1. PRESERVE STRUCTURE: #{structure_instructions}
          2. ATTRIBUTES - DYNAMIC vs STATIC:
             - DYNAMIC: You MUST update the 'lang' attribute to '#{lang}'.
             - STATIC: You are FORBIDDEN from changing 'category', 'name', or 'section'.
          3. YAML: Keep every key exactly as provided. TRANSLATE the values of 'title' and
             'subtitle' (they are the headings readers see). Keep every other value exactly as
             provided (nav_id, parent_guide, guide_id, order, layout, active_nav, name_key, url).
          4. CONTENT: Translate the readable text, and the text of alt="..." attributes in
             <img> tags. Keep every other tag, attribute and URL exactly as provided.
          5. GLOSSARY: #{GLOSSARY.to_json}
          
          INPUT:
          #{body_content}
        PROMPT

        # A reply that lost or changed the structure (sections, ids, order) is asked for once more
        translated = call_gemini_api(prompt, lang).to_s
        if is_legacy && !GuideTextCheck.structure_matches?(body_content, translated)
          puts "⚠️ [#{lang}] came back with a different structure: asking again"
          sleep(20)
          translated = call_gemini_api(prompt, lang).to_s
          unless GuideTextCheck.structure_matches?(body_content, translated)
            puts "::warning::#{base_name} [#{lang}]: the structure still differs from the English; check it"
          end
        end
        translated = fill_untranslated(body_content, translated, lang) if is_legacy

        full_master_file << localized_front_matter << "\n" << translated << "\n"
        
        puts "--> Cooldown: Waiting 20s..."
        sleep(20) 
      end
    end

    File.write("_source/#{base_name}.md", full_master_file)
    File.delete(en_file)
    puts "✅ Generated Guide Master: #{base_name}.md"
  end
end