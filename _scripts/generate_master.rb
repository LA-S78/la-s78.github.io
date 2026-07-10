require 'gemini-ai'
require 'json'
require 'fileutils'
require 'parallel'

# Load Glossary
GLOSSARY = JSON.parse(File.read('_data/terminology.json'))['enforced_terms']

# Initialize Client
client = Gemini.new(
  credentials: {
    service: 'generative-language-api',
    api_key: ENV['GEMINI_API_KEY']
  },
  options: { model: 'gemini-1.5-flash' }
)

# Gather all English draft files
files = Dir.glob("_source/*_en.md")

# Process in parallel
Parallel.each(files, in_threads: 4) do |en_file|
  puts "Processing #{en_file}..."
  
  begin
    base_name = File.basename(en_file, "_en.md")
    en_content = File.read(en_file)
    
    # AI Prompt updated to include 'subtitle' in front-matter
    prompt = <<~PROMPT
      You are an expert localization engineer. Transform this English guide into a 'Master File' for my build system.
      
      1. INPUT: English source text.
      2. GLOSSARY (Strictly Enforce These): #{GLOSSARY.to_json}
      3. BLUEPRINT (Use exactly these tokens):
         - Standalone Page: === page--[filename] ===
         - Core Collection: === collection--[collection-name]--[step] ===
         - Guide Gateway: === guide--[lang]--[category]--[guide-name] ===
         - Localized Pane: === pane--[lang]--[category]--[guide-name]--[step]--[pane-name] ===
      
      4. TASK:
         - Generate the complete file content using the headers above.
         - For every section (guide or pane), you MUST include this YAML front-matter block exactly:
           ---
           title: "<Translated Title>"
           subtitle: "<Translated Subtitle>"
           nav_id: "<pane_id or guide_id>"
           parent_guide: "<guide_name>"
           lang: "<lang>"
           order: <order>
           ---
           [Translated Content]
         - Languages required: en, de, es, fr, ru, tr, uk, it.
      
      5. RULES:
         - Do not translate terms in the GLOSSARY differently than provided.
         - Ensure Markdown syntax is preserved exactly.
         - Return ONLY the full file content.
      
      CONTENT:
      #{en_content}
    PROMPT

    response = client.generate_content({ 
      contents: [{ role: 'user', parts: [{ text: prompt }] }] 
    })
    
    translated_text = response.dig("candidates", 0, "content", "parts", 0, "text")
    
    if translated_text.nil? || translated_text.empty?
      raise "API returned empty response."
    end
    
    # Save as Master File
    File.write("_source/#{base_name}.md", translated_text)
    puts "✅ Generated Master File: _source/#{base_name}.md"
    
    # Delete the draft
    File.delete(en_file)
    puts "🗑️ Cleaned up draft: #{en_file}"

  rescue => e
    puts "❌ Error processing #{en_file}: #{e.message}"
    raise e
  end
end