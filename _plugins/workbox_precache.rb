require 'digest'
require 'json'

module WorkboxInjector
  def self.run(dest_path)
    # The only sw.js that matters is at the root
    sw_path = File.join(dest_path, 'sw.js')
    
    # 1. Glob EVERYTHING in the _site folder
    files = Dir.glob(File.join(dest_path, '**', '*.{html,css,js,png,jpg,jpeg,svg,webp,webmanifest}'))
    
    precache_list = files.filter_map do |file|
      # Skip the SW itself
      next if file == sw_path
      
      # Create the absolute URL (e.g., /en/guides/duel.html)
      url = file.sub(dest_path, '')
      revision = Digest::MD5.file(file).hexdigest[0, 10]
      { 'url' => url, 'revision' => revision }
    end
    
    # 2. Inject into the ROOT sw.js
    sw_content = File.read(sw_path)
    injection = "const precacheList = #{precache_list.to_json};\n\n"
    File.write(sw_path, injection + sw_content)
    
    puts "Successfully injected #{precache_list.length} files into root sw.js!"
  end
end