require 'digest'
require 'json'

module WorkboxInjector
  def self.run(dest_path)
    # Print the directory we are actually looking into
    puts "DEBUG: Looking for files in directory: #{File.expand_path(dest_path)}"
    
    # 1. Glob EVERYTHING in the _site folder
    search_pattern = File.join(dest_path, '**', '*.{html,css,js,png,jpg,jpeg,svg,webp,webmanifest}')
    files = Dir.glob(search_pattern)
    
    puts "DEBUG: Found #{files.length} files."
    
    if files.length == 0
      puts "WARNING: No files found to cache! Check your _site path."
      return
    end
    
    sw_path = File.join(dest_path, 'sw.js')
    
    precache_list = files.filter_map do |file|
      next if file == sw_path
      url = file.sub(dest_path, '')
      revision = Digest::MD5.file(file).hexdigest[0, 10]
      { 'url' => url, 'revision' => revision }
    end
    
    # 2. Inject into the ROOT sw.js
    if File.exist?(sw_path)
      sw_content = File.read(sw_path)
      injection = "const precacheList = #{precache_list.to_json};\n\n"
      File.write(sw_path, injection + sw_content)
      puts "Successfully injected #{precache_list.length} files into root sw.js!"
    else
      puts "ERROR: Could not find #{sw_path} to inject into."
    end
  end
end