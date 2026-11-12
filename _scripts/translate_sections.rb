# Translates the tools' text (_data/en/tools.yml) into the site's other languages with
# Gemini, one top-level section at a time (owner decision, 2026-11-12; maintainer review):
#
#   - The English file is the only one people edit. Each top-level key (e.g. `dashboard`)
#     is a section (aim for about 25–60 strings each).
#   - When anything in a section's English changes, that whole section is translated again
#     for every language (so wording stays consistent with its neighbours). Unchanged
#     sections are not sent again.
#   - What was translated from which English is remembered in _scripts/translation_state.json
#     (a fingerprint of each section's English per language).
#   - Text goes to Gemini and back as JSON (no YAML quoting pitfalls, e.g. French "Statut : …").
#   - A reply is only saved if it has the English keys and keeps every {placeholder};
#     otherwise that section stays as it was (the site shows English until the next run).
#     Russian and Ukrainian may add a `_few` form (2–4) beside each `_one`/`_other` pair.
#   - Human fixes go in _data/translation_overrides.yml (lang → section → key); they are laid
#     over the translation every run, so they survive re-translations.
#
# Runs in CI on pushes to main/dev (see .github/workflows/workflow.yml), before the build.
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
# How to address the reader, and button verbs (maintainer review, 2026-11-12).
ADDRESS = { 'de' => 'the informal "du"', 'es' => 'the informal "tú"', 'it' => 'the informal "tu"',
            'fr' => 'the polite "vous" usual in apps', 'ru' => 'the polite "вы" usual in apps',
            'uk' => 'the polite "ви" usual in apps', 'tr' => 'the polite "siz" usual in apps' }.freeze
VERBS = { 'tr' => 'the usual UI imperative (e.g. "Kopyala")' }.freeze
FEW_PLURAL = %w[ru uk].freeze # languages with a separate form for 2–4
STATE_FILE = '_scripts/translation_state.json'
OVERRIDES_FILE = '_data/translation_overrides.yml'
COOLDOWN = 8 # seconds between Gemini calls
CHECK_ONLY = ARGV.include?('--check')

def fingerprint(value)
  Digest::SHA256.hexdigest(JSON.generate(value))[0, 16]
end

def placeholders(text)
  text.to_s.scan(/\{[a-z_][a-z0-9_]*\}/i).sort
end

# Keys a language may add beside the English ones: `x_few` next to `x_one`/`x_other` (ru, uk).
def extra_plural_keys(en_hash, lang)
  return [] unless FEW_PLURAL.include?(lang)
  en_hash.keys.map(&:to_s).grep(/_other\z/).map { |k| k.sub(/_other\z/, '_few') }
end

# The English keys (and list lengths) at every level, every string keeps its {placeholders}.
def same_shape?(en, tr, lang)
  case en
  when Hash
    return false unless tr.is_a?(Hash)
    keys = tr.keys.map(&:to_s)
    extra = keys - en.keys.map(&:to_s)
    return false unless (en.keys.map(&:to_s) - keys).empty? && (extra - extra_plural_keys(en, lang)).empty?
    extra.each do |few|
      return false unless same_shape?(en[few.sub(/_few\z/, '_other')], tr[few], lang)
    end
    en.all? { |k, v| same_shape?(v, tr[k.to_s], lang) }
  when Array
    tr.is_a?(Array) && tr.length == en.length && en.each_with_index.all? { |v, i| same_shape?(v, tr[i], lang) }
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

def prompt_for(sections, lang)
  plural = if FEW_PLURAL.include?(lang)
             "For every pair of keys ending in _one and _other, also add a key ending in _few " \
               "(the form for 2–4, e.g. \"3 строки\"); _other is then the form for 5 and more."
           else
             'Keys ending in _one and _other are the singular and plural of the same text.'
           end
  <<~PROMPT
    You translate the user interface text of a website for players of the mobile strategy
    game "Last Asylum" from English into #{LANG_NAMES[lang]}. The text is JSON.

    RULES:
    1. Keep every JSON key exactly as it is. Translate only the text values.
    2. Keep every {placeholder} (e.g. {name}, {n}) exactly as written, untranslated.
    3. Keep emoji, HTML tags and numbers as they are. Keep these untranslated: KvK, NAP,
       T10, R1, R2, R3, R4, R5, UTC-2, GT, Game Time, alliance tags in [brackets], Discord.
    4. #{plural}
    5. Address the reader with #{ADDRESS[lang]}. Buttons and short labels use
       #{VERBS[lang] || 'the infinitive, as apps usually do (e.g. French "Copier", Russian "Скопировать")'},
       and must stay short.
    6. Use these game terms: #{glossary_for(lang)}
    7. Reply with the JSON only, in the same structure.

    #{JSON.pretty_generate(sections)}
  PROMPT
end

def ask_gemini(sections, lang)
  require_relative 'gemini_client'
  # Few retries: a busy Gemini mustn't hold up the deploy; English shows until the next push.
  reply = call_gemini_api(prompt_for(sections, lang), lang, max_retries: 3, json: true).to_s
  reply = reply.gsub(/^```[a-z]*\s*$/i, '').strip
  parsed = JSON.parse(reply)
  parsed.is_a?(Hash) ? parsed : {}
rescue => e
  puts "  ⚠️ #{lang}: no usable reply (#{e.message.lines.first&.strip})"
  {}
end

# Human fixes (_data/translation_overrides.yml, lang → section → key…): laid over the
# translation, for keys that exist in English and keep the English {placeholders}.
def apply_overrides(data, english, fixes, where, lang)
  fixes.each do |key, value|
    here = "#{where}.#{key}"
    if value.is_a?(Hash) && english[key].is_a?(Hash)
      data[key] = data[key].is_a?(Hash) ? data[key] : {}
      apply_overrides(data[key], english[key], value, here, lang)
    elsif value.is_a?(String) && (english.key?(key) || extra_plural_keys(english, lang).include?(key))
      model = english[key] || english[key.sub(/_few\z/, '_other')]
      if model.is_a?(String) && placeholders(model) == placeholders(value)
        data[key] = value
      else
        puts "  ⚠️ override #{here}: its {placeholders} differ from the English; not used"
      end
    else
      puts "  ⚠️ override #{here}: no such English text; not used"
    end
  end
  data
end

def yaml_text(data, source)
  "# Translated automatically from #{source} by _scripts/translate_sections.rb.\n" \
    "# Don't edit: change the English file (a section is translated again when its English\n" \
    "# changes), or put a fix in #{OVERRIDES_FILE} (kept through re-translations).\n" +
    data.to_yaml(line_width: -1).sub(/\A---\s*\n/, '')
end

state = File.exist?(STATE_FILE) ? JSON.parse(File.read(STATE_FILE)) : {}
overrides = (File.exist?(OVERRIDES_FILE) && YAML.load_file(OVERRIDES_FILE)) || {}
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
    unless todo.empty? && stale.empty?
      puts "#{name} [#{lang}]: #{todo.empty? ? 'no' : todo.keys.join(', ')} to translate" \
           "#{stale.empty? ? '' : "; removing #{stale.join(', ')}"}"
    end
    next if CHECK_ONLY

    translated = {}
    unless todo.empty?
      sleep(COOLDOWN) if calls.positive?
      calls += 1
      reply = ask_gemini(todo, lang)
      todo.each do |section, value|
        if same_shape?(value, reply[section], lang)
          translated[section] = reply[section]
          state["#{name}/#{lang}/#{section}"] = fingerprint(value)
        else
          puts "  ⚠️ #{lang}/#{section}: reply didn't match the English keys or placeholders; kept as it was"
        end
      end
    end

    # English order; sections removed from the English file go; human fixes on top.
    merged = english.keys.each_with_object({}) do |section, out|
      value = translated.key?(section) ? translated[section] : current[section]
      out[section] = Marshal.load(Marshal.dump(value)) unless value.nil?
    end
    apply_overrides(merged, english, overrides[lang] || {}, lang, lang)
    stale.each { |section| state.delete("#{name}/#{lang}/#{section}") }

    text = yaml_text(merged, source)
    next if File.exist?(path) && File.read(path) == text && translated.empty? && stale.empty?

    FileUtils.mkdir_p(File.dirname(path))
    File.write(path, text)
    File.write(STATE_FILE, JSON.pretty_generate(state.sort.to_h) + "\n")
    puts "  ✅ #{path} (#{translated.size} section(s) translated)"
  end
end
puts(calls.zero? && !CHECK_ONLY ? 'Every translated section is up to date.' : "Done (#{calls} Gemini call(s)).")
