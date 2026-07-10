require 'net/http'
require 'uri'
require 'json'
require 'fileutils'

$stdout.sync = true

GLOSSARY = JSON.parse(File.read('_data/terminology.json'))['enforced_terms']
API_KEY = ENV['GEMINI_API_KEY']
LANGUAGES = ['en', 'de', 'es', 'fr', 'ru', 'tr', 'uk', 'it']

def call_gemini_api(prompt, lang)
  uri = URI("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=#{API_KEY}")
  header = { 'Content-Type': 'application/json' }
  body = { contents: [{ parts: [{ text: prompt }] }] }
  
  max_retries = 8
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
    elsif ['429', '503', '500'].include?(response.code)
      raise "Rate limit/High demand hit."
    else
      raise "API Error (#{response.code}): #{response.body}"
    end

  rescue => e
    if attempt <= max_retries
      wait_time = (2 ** (attempt - 1)) * 30 
      puts "⚠️ #{e.message} Retrying in #{wait_time}s... (Attempt #{attempt}/#{max_retries})"
      sleep(wait_time)
      retry
    else
      raise "Failed after #{max_retries} attempts."
    end
  end
end

all_drafts = Dir.glob("_source/*_en.md")
files = all_drafts.empty? ? [] : [all_drafts.first]

files.each do |en_file|
  base_name = File.basename(en_file, "_en.md")
  full_content = File.read(en_file)

  # Detect format
  is_legacy = full_content.include?("===")
  
  # Define formatting instructions based on detection
  structure_instructions = is_legacy ? 
    "- Legacy Delimiters: Use '=== guide--[lang]--[category]--[guide-name] ===' and '=== pane--[lang]--[category]--[guide-name]--[step]--[pane-name] ==='." :
    "- XML Schema: Use '<guide lang=\"#{LANGUAGES.join('|')}\" category=\"[category]\" name=\"[guide-name]\">' and '<pane lang=\"#{LANGUAGES.join('|')}\" category=\"[category]\" name=\"[guide-name]\" section=\"[step]--[name]\">'."

  # Surgery: Extract Front Matter
  front_matter = ""
  body_content = full_content
  if full_content =~ /\A(---\s*\n.*?\n---\s*\n)/m
    front_matter = $1
    body_content = full_content.sub(front_matter, "")
  end

  final_output = front_matter

  LANGUAGES.each do |lang|
    puts "--> Processing #{base_name} [Lang: #{lang}] [Format: #{is_legacy ? 'Legacy' : 'XML'}]"
    
    prompt = <<~PROMPT
      You are an expert localization engineer. Your goal is to translate the content, NOT the code.
      
      CRITICAL SCHEMA RULES (VIOLATION RESULTS IN BUILD FAILURE):
      1. XML tags (<guide>, <pane>) are IMMUTABLE. Do NOT modify, translate, or reformat these tags.
      2. ATTRIBUTES ARE IMMUTABLE: You are STRICTLY FORBIDDEN from changing the values inside the attributes (lang, category, name, section). 
         - If the input is name="crystal-valley", the output MUST be name="crystal-valley". 
         - If the input is section="01--objectives", the output MUST be section="01--objectives".
      3. YAML FRONT MATTER: Keep keys (e.g., 'parent_guide') exactly as provided.
      4. CONTENT ONLY: Only translate the readable text content outside of the XML tags and YAML blocks.
      
      5. GLOSSARY (Strictly enforce these terms):
         #{GLOSSARY.to_json}
      
      6. INPUT CONTENT:
         #{body_content}
    PROMPT

    final_output << "\n" << call_gemini_api(prompt, lang) << "\n"
    
    puts "--> Cooldown: Waiting 20s..."
    sleep(20) 
  end

  File.write("_source/#{base_name}.md", final_output)
  File.delete(en_file)
  puts "✅ Generated: #{base_name}.md"
end