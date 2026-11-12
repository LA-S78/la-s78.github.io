# Calls Gemini (the model that translates the site) and returns the reply text.
# Shared by _scripts/generate_master.rb (guides and data drafts) and
# _scripts/translate_sections.rb (the tools' text). Needs GEMINI_API_KEY (set in CI only).

require 'net/http'
require 'uri'
require 'json'

GEMINI_MODEL = 'gemini-3.1-flash-lite'

def call_gemini_api(prompt, _lang = nil, max_retries: 8)
  uri = URI("https://generativelanguage.googleapis.com/v1beta/models/#{GEMINI_MODEL}:generateContent?key=#{ENV['GEMINI_API_KEY']}")
  header = { 'Content-Type': 'application/json' }
  body = { contents: [{ parts: [{ text: prompt }] }] }

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
      return data.dig('candidates', 0, 'content', 'parts', 0, 'text')
    elsif %w[429 503 500].include?(response.code)
      raise 'Rate limit/High demand hit.'
    else
      raise "API Error (#{response.code}): #{response.body}"
    end
  rescue => e
    if attempt <= max_retries
      wait_time = (2**(attempt - 1)) * 30
      puts "⚠️ #{e.message} Retrying in #{wait_time}s... (Attempt #{attempt}/#{max_retries})"
      sleep(wait_time)
      retry
    else
      raise "Failed after #{max_retries} attempts."
    end
  end
end
