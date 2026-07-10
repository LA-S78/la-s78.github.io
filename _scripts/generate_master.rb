require 'net/http'
require 'uri'
require 'json'
require 'fileutils'

# Load Glossary
GLOSSARY = JSON.parse(File.read('_data/terminology.json'))['enforced_terms']
API_KEY = ENV['GEMINI_API_KEY']
LANGUAGES = ['en', 'de', 'es', 'fr', 'ru', 'tr', 'uk', 'it']

def call_gemini_api(prompt)
  uri = URI("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=#{API_KEY}")
  header = { 'Content-Type': 'application/json' }
  body = { contents: [{ parts: [{ text: prompt }] }] }
  
  max_retries = 5 # Increased retries
  attempt = 0
  
  begin
    attempt += 1
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.open_timeout = 30
    http.read_timeout = 300
    
    request = Net::HTTP::Post.new(uri.request_uri, header)
    request.body = body.to_json
    
    response = http.request(request)
    
    if response.code == '200'
      data = JSON.parse(response.body)
      return data.dig("candidates", 0, "content", "parts", 0, "text")
    elsif response.code == '429' || response.code == '503'
      raise "Rate limit/High demand hit."
    else
      raise "API Error (#{response.code}): #{response.body}"
    end

  rescue => e
    if attempt <= max_retries
      # Exponential backoff + jitter to avoid synchronization
      wait_time = (2 ** attempt) + rand(1..3)
      puts "⚠️ High demand detected. Waiting #{wait_time}s before retry... (Attempt #{attempt}/#{max_retries})"
      sleep(wait_time)
      retry
    else
      raise "Failed after #{max_retries} attempts: #{e.message}"
    end
  end
end

# Sequential processing: 1 file at a time, 1 language at a time
files = Dir.glob("_source/*_en.md")

files.each do |en_file|
  begin
    base_name = File.basename(en_file, "_en.md")
    en_content = File.read(en_file)
    final_output = ""

    LANGUAGES.each do |lang|
      puts "--> Processing #{base_name} for language: #{lang}"
      
      prompt = <<~PROMPT
        You are an expert localization engineer. Translate the following English content into '#{lang}'.
        
        1. GLOSSARY (Strictly Enforce These): #{GLOSSARY.to_json}
        2. BLUEPRINT:
           - Standalone Page: === page--[filename] ===
           - Core Collection: === collection--[collection-name]--[step] ===
           - Guide Gateway: === guide--#{lang}--[category]--[guide-name] ===
           - Localized Pane: === pane--#{lang}--[category]--[guide-name]--[step]--[pane-name] ===
        
        3. TASK:
           - Translate the content into #{lang}.
           - For every section (guide or pane), use this YAML exactly:
             ---
             title: "<Translated Title>"
             subtitle: "<Translated Subtitle>"
             nav_id: "<id>"
             parent_guide: "<guide_name>"
             lang: "#{lang}"
             order: <order>
             ---
             [Translated Content]
        
        CONTENT:
        #{en_content}
      PROMPT

      translated_chunk = call_gemini_api(prompt)
      final_output << translated_chunk << "\n"
      
      # MANDATORY COOLDOWN: 5 seconds between languages to satisfy API pacing
      puts "--> Cooldown: Waiting 15s to stay under rate limits..."
      sleep(15) 
    end

    File.write("_source/#{base_name}.md", final_output)
    File.delete(en_file)
    puts "✅ Generated Master File: #{base_name}.md"
    
  rescue => e
    puts "❌ Error processing #{en_file}: #{e.message}"
    raise e
  end
end