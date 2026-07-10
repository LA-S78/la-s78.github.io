require 'google_generative_ai'
require 'json'
require 'fileutils'
require 'parallel'

# Load Glossary
GLOSSARY = JSON.parse(File.read('_data/terminology.json'))['enforced_terms']
CLIENT = Google::GenerativeAI::Client.new(api_key: ENV['GEMINI_API_KEY'])

# Gather all English draft files
files = Dir.glob("_source/*_en.md")

# Process files in parallel to save time during build
Parallel.each(files, in_threads: 4) do |en_file|
  puts "Processing #{en_file}..."
  
  begin
    base_name = File.basename(en_file, "_en.md")
    en_content = File.read(en_file)
    
    # AI Prompt
    prompt = <<~PROMPT
      You are an expert localization engineer. Transform this English guide into a 'Master File' for my build system.
      
      1. INPUT: English source text.
      2. GLOSSARY (Strictly Enforce These): #{GLOSSARY.to_json}
      3. TASK:
         - Generate the complete file content.
         - Use the following format for every section:
           === pane--<lang>--<category>--<guide_name>--<order>--<pane_id> ===
           ---
           title: "<Translated Title>"
           nav_id: "<pane_id>"
           parent_guide: "<guide_name>"
           lang: "<lang>"
           order: <order>
           ---
           [Translated Content]
         - Languages required: en, de, es, fr, ru, tr, uk, it.
      4. RULES:
         - Do not translate terms in the GLOSSARY differently than provided.
         - Use the English source as the semantic base for all translations.
         - Ensure Markdown syntax is preserved.
         - Return ONLY the full file content.
      
      CONTENT:
      #{en_content}
    PROMPT

    response = CLIENT.generate_content(prompt)
    
    # Save as Master File
    File.write("_source/#{base_name}.md", response.text)
    puts "✅ Generated Master File: _source/#{base_name}.md"
    
    # Delete the draft to avoid reprocessing
    File.delete(en_file)
    puts "🗑️ Cleaned up draft: #{en_file}"

  rescue => e
    puts "❌ Error processing #{en_file}: #{e.message}"
    raise e # Ensure the build fails if a translation fails
  end
end