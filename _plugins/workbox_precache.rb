require 'digest'
require 'json'

module WorkboxInjector
  def self.run(dest_path)
    sw_path = File.join(dest_path, 'sw.js')
    
    # 1. Glob all assets and all language subdirectories
    search_pattern = File.join(dest_path, '**', '*.{html,css,js,png,jpg,jpeg,svg,webp,webmanifest}')
    files = Dir.glob(search_pattern)
    
    precache_list = files.filter_map do |file|
      next if file.include?('sw.js') # Avoid caching the SW itself
      url = file.sub(dest_path, '')
      revision = Digest::MD5.file(file).hexdigest[0, 10]
      { 'url' => url, 'revision' => revision }
    end
    
    # 2. Read, Inject, and Write
    sw_content = File.read('sw.js') # Read source sw.js
    injection = "const precacheList = #{precache_list.to_json};\n\n"
    File.write(sw_path, injection + sw_content)
    
    puts "Successfully injected #{precache_list.length} files!"
  end
end