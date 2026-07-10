require 'net/http'
require 'uri'
require 'json'
require 'parallel'
require 'fileutils'

# Load Glossary
GLOSSARY = JSON.parse(File.read('_data/terminology.json'))['enforced_terms']
API_KEY = ENV['GEMINI_API_KEY']

def call_gemini_api(prompt)
  uri = URI("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=#{API_KEY}")
  header = { 'Content-Type': 'application/json' }
  
  # Prepare the request body
  body = {
    contents: [{ parts: [{ text: prompt }] }]
  }

  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = true
  
  request = Net::HTTP::Post.new(uri.request_uri, header)
  request.body = body.to_json
  
  response = http.request(request)
  
  if response.code == '200'
    data = JSON.parse(response.body)
    return data.dig("candidates", 0, "content", "parts", 0, "text")
  else
    raise "API Error (#{response.code}): #{response.body}"
  end
end

files = Dir.glob("_source/*_en.md")

Parallel.each(files, in_threads: 4) do |en_file|
  begin
    base_name = File.basename(en_file, "_en.md")
    en_content = File.read(en_file)
    
    prompt = <<~PROMPT
      You are an expert localization engineer. Transform this English guide into a 'Master File'.
      
      1. GLOSSARY (Strictly Enforce These): #{GLOSSARY.to_json}
      2. BLUEPRINT:
         - Standalone Page: === page--[filename] ===
         - Core Collection: === collection--[collection-name]--[step] ===
         - Guide Gateway: === guide--[lang]--[category]--[guide-name] ===
         - Localized Pane: === pane--[lang]--[category]--[guide-name]--[step]--[pane-name] ===
      
      3. TASK:
         - Generate the complete file content.
         - For every section (guide or pane), use this YAML exactly:
           ---
           title: "<Translated Title>"
           subtitle: "<Translated Subtitle>"
           nav_id: "<id>"
           parent_guide: "<guide_name>"
           lang: "<lang>"
           order: <order>
           ---
           [Translated Content]
         - Languages required: en, de, es, fr, ru, tr, uk, it.
      
      CONTENT:
      #{en_content}
    PROMPT

    translated_text = call_gemini_api(prompt)
    
    File.write("_source/#{base_name}.md", translated_text)
    File.delete(en_file)
    puts "✅ Generated: #{base_name}.md"
  rescue => e
    puts "❌ Error processing #{en_file}: #{e.message}"
    raise e
  end
end