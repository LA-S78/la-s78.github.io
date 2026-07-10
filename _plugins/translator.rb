require 'google_generative_ai'
require 'json'
require 'parallel' # Used for speed

# 1. Config
GLOSSARY = JSON.parse(File.read('_data/terminology.json'))['enforced_terms']
PASS_THROUGH = ["Might", "Lion Coins"] # Terms the AI MUST NOT touch even if they aren't in the glossary
CLIENT = Google::GenerativeAI::Client.new(api_key: ENV['GEMINI_API_KEY'])

def translate_file(file_path, target_lang)
  content = File.read(file_path)
  
  # 1. PRE-PROCESS: Glossary Swap (Solves the Title/Subtitle issue)
  # By doing this here, the AI never sees "Alliance Duel", it only sees "Allianz-Duell"
  processed_content = content.dup
  GLOSSARY.each do |en_term, translations|
    if translations.key?(target_lang)
      pattern = /\b#{Regexp.escape(en_term)}\b/
      processed_content.gsub!(pattern, translations[target_lang])
    end
  end

  # 2. AI TRANSLATION
  prompt = <<~PROMPT
    You are an expert game localization specialist. 
    Translate the following content into #{target_lang}. 
    
    CRITICAL INSTRUCTIONS:
    - Keep all YAML front-matter keys (like title, subtitle) and Liquid tags (like {%...%}) exactly as they are.
    - Translate the values of these keys naturally.
    - Do NOT translate these specific terms: #{PASS_THROUGH.join(', ')}.
    - The terminology terms (like event names) are already localized in the text via glossary replacement. Do not alter them.
    - Maintain a professional tone suitable for a gaming guide.
    
    CONTENT:
    #{processed_content}
  PROMPT

  response = CLIENT.generate_content(prompt)
  return response.text
end

# 3. PARALLEL EXECUTION (The Speed Layer)
# Assuming 'files' is an array of file paths
files = Dir.glob("_source/*.md")

Parallel.each(files, in_threads: 4) do |file|
  # Example target_lang logic
  target_lang = "de" 
  puts "Translating #{file} to #{target_lang}..."
  result = translate_file(file, target_lang)
  
  # Save to your _source_translated/ folder
  File.write("_source_translated/#{target_lang}/#{File.basename(file)}", result)
end