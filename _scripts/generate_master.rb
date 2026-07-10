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

  # 1. Detect format
  is_legacy = full_content.include?("===")
  structure_instructions = is_legacy ? 
    "- Legacy Delimiters: Use '=== guide--[lang]--... ==='." :
    "- XML Schema: Use '<guide lang=\"#{LANGUAGES.join('|')}\" ...>' and '<pane lang=\"#{LANGUAGES.join('|')}\" ...>'."

  # 2. Extract original front matter
  front_matter = ""
  body_content = full_content
  if full_content =~ /\A(---\s*\n.*?\n---\s*\n)/m
    front_matter = $1
    body_content = full_content.sub(front_matter, "")
  end

  # We will build the master file string
  full_master_file = ""

  # 3. Process languages
  LANGUAGES.each do |lang|
    puts "--> Processing #{base_name} [Lang: #{lang}]"
    
    # DYNAMIC FRONT MATTER: Update the YAML language key
    localized_front_matter = front_matter.dup
    localized_front_matter.gsub!(/^lang:\s*["']?en["']?/, "lang: \"#{lang}\"")
    
    if lang == 'en'
      puts "--> Preserving English source..."
      full_master_file << localized_front_matter << body_content << "\n"
    else
      prompt = <<~PROMPT
        You are an expert localization engineer. Translate the content, preserving the structural schema.
        
        CRITICAL RULES:
        1. PRESERVE STRUCTURE: #{structure_instructions}
        2. ATTRIBUTES - DYNAMIC vs STATIC:
           - DYNAMIC: You MUST update the 'lang' attribute to '#{lang}'.
           - STATIC: You are FORBIDDEN from changing 'category', 'name', or 'section'.
        3. YAML: Keep all keys (title, subtitle, etc.) exactly as provided.
        4. CONTENT: Translate ONLY readable text outside tags/YAML. 
        5. GLOSSARY: #{GLOSSARY.to_json}
        
        INPUT:
        #{body_content}
      PROMPT

      # Append the localized header + the translated AI response
      full_master_file << localized_front_matter << "\n" << call_gemini_api(prompt, lang) << "\n"
      
      puts "--> Cooldown: Waiting 20s..."
      sleep(20) 
    end
  end

  File.write("_source/#{base_name}.md", full_master_file)
  File.delete(en_file)
  puts "✅ Generated: #{base_name}.md"
end