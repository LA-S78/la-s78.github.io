require 'digest'
require 'json'

module WorkboxInjector
  def self.run(dest_path)
    # 1. Generate the master list of all files in _site
    search_pattern = File.join(dest_path, '**', '*.{html,css,js,png,jpg,jpeg,svg,webp,webmanifest}')
    files = Dir.glob(search_pattern)
    
    precache_list = files.filter_map do |file|
      next if file.include?('sw.js') # Don't cache the SW itself
      url = file.sub(dest_path, '')
      revision = Digest::MD5.file(file).hexdigest[0, 10]
      { 'url' => url, 'revision' => revision }
    end
    
    injection = "const precacheList = #{precache_list.to_json};\n\n"
    
    # 2. Find and inject into EVERY sw.js file found
    sw_files = Dir.glob(File.join(dest_path, '**', 'sw.js'))
    
    sw_files.each do |sw_path|
      puts "Injecting into: #{sw_path}"
      sw_content = File.read(sw_path)
      
      # Only inject if it hasn't been injected yet to prevent duplicate headers
      unless sw_content.include?('const precacheList')
        File.write(sw_path, injection + sw_content)
      end
    end
    
    puts "Successfully injected #{precache_list.length} files into #{sw_files.length} Service Worker files!"
  end
end