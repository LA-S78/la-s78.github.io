require 'net/http'
require 'uri'
require 'json'
require 'fileutils'

GLOSSARY = JSON.parse(File.read('_data/terminology.json'))['enforced_terms']
API_KEY = ENV['GEMINI_API_KEY']

# Batching languages into 2 groups of 4
BATCHES = [
  ['en', 'de', 'es', 'fr'],
  ['ru', 'tr', 'uk', 'it']
]

def call_gemini_api(prompt)
  uri = URI("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=#{API_KEY}")
  header = { 'Content-Type': 'application/json' }
  body = { contents: [{ parts: [{ text: prompt }] }] }
  
  max_retries = 3
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
      wait_time = (2 ** attempt) + 5
      puts "⚠️ High demand detected. Waiting #{wait_time}s... (Attempt #{attempt}/#{max_retries})"
      sleep(wait_time)
      retry
    else
      raise "Failed after #{max_retries} attempts: #{e.message}"
    end
  end
end

# Only process the first pending file
all_drafts = Dir.glob("_source/*_en.md")
files = all_drafts.empty? ? [] : [all_drafts.first]

files.each do |en_file|
  base_name = File.basename(en_file, "_en.md")
  en_content = File.read(en_file)
  final_output = ""

  BATCHES.each_with_index do |lang_batch, idx|
    puts "--> Processing #{base_name} (Batch #{idx + 1}/2: #{lang_batch.join(', ')})"
    
    prompt = <<~PROMPT
      You are an expert localization engineer. Translate the following English content into these languages: #{lang_batch.join(', ')}.
      
      1. GLOSSARY: #{GLOSSARY.to_json}
      2. BLUEPRINT:
         - Guide Gateway: === guide--[lang]--[category]--[guide-name] ===
         - Localized Pane: === pane--[lang]--[category]--[guide-name]--[step]--[pane-name] ===
      
      3. TASK:
         - Generate content for ALL requested languages: #{lang_batch.join(', ')}.
         - For every section, use this YAML exactly:
           ---
           title: "<Translated Title>"
           subtitle: "<Translated Subtitle>"
           nav_id: "<id>"
           parent_guide: "<guide_name>"
           lang: "<lang>"
           order: <order>
           ---
           [Translated Content]
      
      CONTENT:
      #{en_content}
    PROMPT

    final_output << call_gemini_api(prompt) << "\n"
    
    # 15s cooldown between batches to protect RPM
    puts "--> Cooldown: Waiting 15s..."
    sleep(15) 
  end

  File.write("_source/#{base_name}.md", final_output)
  File.delete(en_file)
  puts "✅ Generated Master File: #{base_name}.md"
end