# _scripts/build_translations.rb
require 'yaml'
require 'json'
require 'fileutils'

DATA_DIR = File.expand_path('../_data', __dir__)
OUTPUT_FILE = File.expand_path('../api/_generated_translations.js', __dir__)

SUPPORTED_LOCALES = %w[en es de fr ru it tr uk]

rules_by_lang = {}
sb_by_lang = {}
bot_by_lang = {}

SUPPORTED_LOCALES.each do |lang|
  # 1. Rules
  rules_path = File.join(DATA_DIR, lang, 'rules.yml')
  if File.exist?(rules_path)
    begin
      rules_by_lang[lang] = YAML.load_file(rules_path)
    rescue StandardError => e
      # Silently ignored to match JS implementation
    end
  end

  # 2. Survival Battle
  sb_path = File.join(DATA_DIR, lang, 'survival_battle.yml')
  if File.exist?(sb_path)
    begin
      sb_by_lang[lang] = YAML.load_file(sb_path)
    rescue StandardError => e
      # Silently ignored to match JS implementation
    end
  end

  # 3. Bot UI Strings
  bot_path = File.join(DATA_DIR, lang, 'bot.yml')
  if File.exist?(bot_path)
    begin
      bot_by_lang[lang] = YAML.load_file(bot_path)
    rescue StandardError => e
      warn "⚠️ Failed to parse #{bot_path}: #{e.message}"
    end
  end
end

file_content = <<~JAVASCRIPT
  /**
   * AUTO-GENERATED AT BUILD TIME FROM _data/
   * DO NOT EDIT MANUALLY.
   */
  export const RULES_DATA = #{JSON.pretty_generate(rules_by_lang)};
  export const SB_DATA = #{JSON.pretty_generate(sb_by_lang)};
  export const BOT_DATA = #{JSON.pretty_generate(bot_by_lang)};
JAVASCRIPT

FileUtils.mkdir_p(File.dirname(OUTPUT_FILE))
File.write(OUTPUT_FILE, file_content)

puts "✅ Build-time translations successfully generated at #{OUTPUT_FILE}"