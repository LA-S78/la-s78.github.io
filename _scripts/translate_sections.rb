# Translates the tools' text (_data/en/tools.yml) into the site's other languages with
# Gemini, one top-level section at a time (owner decision, 2026-11-12):
#
#   - The English file is the only one people edit. Each top-level key (e.g. `dashboard`)
#     is a section.
#   - When anything in a section's English changes, that whole section is translated again
#     for every language (so wording stays consistent with its neighbours). Unchanged
#     sections are left alone, including any hand-corrected translation.
#   - What was translated from which English is remembered in _scripts/translation_state.json
#     (a fingerprint of each section's English per language).
#   - A reply is only saved if it has exactly the English keys and keeps every {placeholder};
#     otherwise that section stays as it was (the site shows English until the next run).
#
# Runs in CI on pushes to main (see .github/workflows/workflow.yml), before the build.
#   GEMINI_API_KEY=... ruby _scripts/translate_sections.rb            translate what changed
#   ruby _scripts/translate_sections.rb --check                         list what would be sent

require 'yaml'
require 'json'
require 'digest'
require 'fileutils'

Encoding.default_external = Encoding::UTF_8
$stdout.sync = true
Dir.chdir(File.expand_path('..', __dir__))

FILES = %w[tools].freeze # _data/en/<name>.yml files translated this way
LANGS = %w[de es fr ru tr uk it].freeze
LANG_NAMES = { 'de' => 'German', 'es' => 'Spanish', 'fr' => 'French', 'ru' => 'Russian',
               'tr' => 'Turkish', 'uk' => 'Ukrainian', 'it' => 'Italian' }.freeze
STATE_FILE = '_scripts/translation_state.json'
COOLDOWN = 8 # seconds between Gemini calls
CHECK_ONLY = ARGV.include?('--check')

def fingerprint(value)
  Digest::SHA256.hexdigest(JSON.generate(value))[0, 16]
end

def placeholders(text)
  text.to_s.scan(/\{[a-z_][a-z0-9_]*\}/i).sort
end

# Same keys (and list lengths) at every level, every string keeps its {placeholders}.
def same_shape?(en, tr, path = [])
  case en
  when Hash
    return false unless tr.is_a?(Hash) && tr.keys.map(&:to_s).sort == en.keys.map(&:to_s).sort
    en.all? { |k, v| same_shape?(v, tr[k.to_s], path + [k]) }
  when Array
    tr.is_a?(Array) && tr.length == en.length && en.each_with_index.all? { |v, i| same_shape?(v, tr[i], path + [i]) }
  when String
    tr.is_a?(String) && !tr.strip.empty? && placeholders(tr) == placeholders(en)
  else
    tr == en
  end
end

def glossary_for(lang)
  terms = JSON.parse(File.read('_data/terminology.json'))['enforced_terms'] rescue {}
  terms.filter_map { |en, by| "#{en} = #{by[lang]}" if by.is_a?(Hash) && by[lang] }.join('; ')
end

def ask_gemini(sections, lang)
  require_relative 'gemini_client'
  prompt = <<~PROMPT
    You translate the user interface text of a website for players of the mobile game
    "Last Asylum" from English into #{LANG_NAMES[lang]}. The text is YAML.

    RULES:
    1. Keep every YAML key exactly as it is. Translate only the text values.
    2. Keep every {placeholder} (e.g. {name}, {n}) exactly as written, untranslated.
    3. Keep emoji, HTML tags, "R4", "R5", alliance tags in [brackets], "Game Time", "GT",
       "Discord" and numbers as they are. Keys ending in _one and _other are the singular
       and plural of the same text.
    4. Short button and label texts must stay short. Use the informal "you" where the
       language has one.
    5. Use these game terms: #{glossary_for(lang)}
    6. Reply with the YAML only: no explanation, no code fences.

    #{sections.to_yaml(line_width: -1).sub(/\A---\s*\n/, '')}
  PROMPT
  # Few retries: a busy Gemini mustn't hold up the deploy; English shows until the next push.
  reply = call_gemini_api(prompt, lang, max_retries: 3).to_s
  reply = reply.gsub(/^```[a-z]*\s*$/i, '').strip
  YAML.safe_load(reply) || {}
rescue => e
  puts "  ⚠️ #{lang}: no usable reply (#{e.message.lines.first&.strip})"
  {}
end

def write_yaml(path, data, source)
  FileUtils.mkdir_p(File.dirname(path))
  header = "# Translated automatically from #{source} by _scripts/translate_sections.rb.\n" \
           "# Edit the English file; a section is translated again when its English changes.\n" \
           "# A correction made here is kept until that section's English changes.\n"
  File.write(path, header + data.to_yaml(line_width: -1).sub(/\A---\s*\n/, ''))
end

state = File.exist?(STATE_FILE) ? JSON.parse(File.read(STATE_FILE)) : {}
unless CHECK_ONLY || ENV['GEMINI_API_KEY'].to_s != ''
  puts 'GEMINI_API_KEY is not set: nothing translated (this only runs in CI).'
  exit 0
end

calls = 0
FILES.each do |name|
  source = "_data/en/#{name}.yml"
  next unless File.exist?(source)
  english = YAML.load_file(source) || {}

  LANGS.each do |lang|
    path = "_data/#{lang}/#{name}.yml"
    current = (File.exist?(path) && YAML.load_file(path)) || {}
    todo = english.select do |section, value|
      state["#{name}/#{lang}/#{section}"] != fingerprint(value) || !current.key?(section)
    end
    stale = current.keys - english.keys
    next if todo.empty? && stale.empty?

    puts "#{name} [#{lang}]: #{todo.empty? ? 'no' : todo.keys.join(', ')} to translate" \
         "#{stale.empty? ? '' : "; removing #{stale.join(', ')}"}"
    next if CHECK_ONLY

    translated = {}
    unless todo.empty?
      sleep(COOLDOWN) if calls.positive?
      calls += 1
      reply = ask_gemini(todo, lang)
      todo.each do |section, value|
        if same_shape?(value, reply[section])
          translated[section] = reply[section]
          state["#{name}/#{lang}/#{section}"] = fingerprint(value)
        else
          puts "  ⚠️ #{lang}/#{section}: reply didn't match the English keys or placeholders; kept as it was"
        end
      end
    end

    # English order; sections removed from the English file go.
    merged = english.keys.each_with_object({}) do |section, out|
      value = translated.key?(section) ? translated[section] : current[section]
      out[section] = value unless value.nil?
    end
    stale.each { |section| state.delete("#{name}/#{lang}/#{section}") }
    write_yaml(path, merged, source)
    File.write(STATE_FILE, JSON.pretty_generate(state.sort.to_h) + "\n")
    puts "  ✅ #{path} (#{translated.size} section(s) translated)"
  end
end
puts(calls.zero? && !CHECK_ONLY ? 'Every translated section is up to date.' : "Done (#{calls} Gemini call(s)).")
