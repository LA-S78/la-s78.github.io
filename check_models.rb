require 'net/http'
require 'uri'
require 'json'

API_KEY = ENV['GEMINI_API_KEY'] || 'YOUR_KEY_HERE' # Replace if not set in ENV
uri = URI("https://generativelanguage.googleapis.com/v1beta/models?key=#{API_KEY}")

puts "Requesting: #{uri}"

begin
  response = Net::HTTP.get_response(uri)
  puts "HTTP Status: #{response.code}"
  puts "--- Raw Response Body ---"
  puts response.body
  puts "-------------------------"

  data = JSON.parse(response.body)
  puts "--- JSON Keys Found ---"
  puts data.keys
rescue => e
  puts "Script failed: #{e.message}"
end