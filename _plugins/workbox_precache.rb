require 'digest'
require 'json'

Jekyll::Hooks.register :site, :post_write do |site|
  Jekyll.logger.info "Workbox:", "Generating offline precache list..."
  
  sw_path = File.join(site.dest, 'sw.js')
  
  # Ensure Jekyll actually generated the Service Worker before trying to modify it
  if File.exist?(sw_path)
    # 1. Glob all the assets and localized guides we want to cache
    search_pattern = File.join(site.dest, '**', '*.{html,css,js,png,jpg,jpeg,svg,webp,webmanifest}')
    files = Dir.glob(search_pattern)
    
    precache_list = files.filter_map do |file|
      # Do not cache the Service Worker itself to prevent update loops
      next if file == sw_path
      
      # Strip the '_site' prefix to create the absolute URL path
      url = file.sub(site.dest, '')
      
      # Generate an MD5 hash of the file contents to tell Workbox when a file updates
      revision = Digest::MD5.file(file).hexdigest[0, 10]
      
      { 'url' => url, 'revision' => revision }
    end
    
    # 2. Read the newly compiled sw.js file
    sw_content = File.read(sw_path)
    
    # 3. Create the exact JavaScript variable your sw.js is expecting
    injection = "const precacheList = #{precache_list.to_json};\n\n"
    
    # 4. Overwrite sw.js with the injected variable securely at the top
    File.write(sw_path, injection + sw_content)
    
    Jekyll.logger.info "Workbox:", "Successfully encrypted and injected #{precache_list.length} files into sw.js!"
  else
    Jekyll.logger.warn "Workbox:", "sw.js not found in _site folder. Skipping precache."
  end
end