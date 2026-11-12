require 'json'
require 'fileutils'
require_relative 'gemini_client' # call_gemini_api

$stdout.sync = true

GLOSSARY = JSON.parse(File.read('_data/terminology.json'))['enforced_terms']
LANGUAGES = ['en', 'de', 'es', 'fr', 'ru', 'tr', 'uk', 'it']

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
    # --- NON-DATA FILE (GUIDE) LOGIC [UNTOUCHED] ---
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
          3. YAML: Keep all keys (title, subtitle, etc.) exactly as provided.
          4. CONTENT: Translate ONLY readable text outside tags/YAML. 
          5. GLOSSARY: #{GLOSSARY.to_json}
          
          INPUT:
          #{body_content}
        PROMPT

        full_master_file << localized_front_matter << "\n" << call_gemini_api(prompt, lang) << "\n"
        
        puts "--> Cooldown: Waiting 20s..."
        sleep(20) 
      end
    end

    File.write("_source/#{base_name}.md", full_master_file)
    File.delete(en_file)
    puts "✅ Generated Guide Master: #{base_name}.md"
  end
end