require 'net/http'
require 'uri'
require 'json'
require 'fileutils'

$stdout.sync = true

GLOSSARY = JSON.parse(File.read('_data/terminology.json'))['enforced_terms']
API_KEY = ENV['GEMINI_API_KEY']
LANGUAGES = ['en', 'de', 'es', 'fr', 'ru', 'tr', 'uk', 'it']

def call_gemini_api(prompt, lang)
  # Use 2.0-flash as it is more stable than the preview/3.5 models
  # Change the model path to the stable Flash-Lite model
  uri = URI("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=#{API_KEY}")
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
      # Exponential backoff starting at 30s
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
  en_content = File.read(en_file)
  final_output = ""

  LANGUAGES.each do |lang|
    puts "--> Processing #{base_name} [Lang: #{lang}]"
    
    prompt = <<~PROMPT
      You are an expert localization engineer. Translate the following content into '#{lang}'.
      [...Blueprint Rules...]
      CONTENT: #{en_content}
    PROMPT

    final_output << call_gemini_api(prompt, lang) << "\n"
    
    puts "--> Cooldown: Waiting 20s to stay under rate limits..."
    sleep(20) 
  end

  File.write("_source/#{base_name}.md", final_output)
  File.delete(en_file)
  puts "✅ Generated: #{base_name}.md"
end