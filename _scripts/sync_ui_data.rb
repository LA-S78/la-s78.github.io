require 'yaml'
require 'fileutils'
require 'json'

# Force real-time console log streaming
$stdout.sync = true

# Memory tree to hold parsed values grouped by target language
@ui_updates = Hash.new { |h, k| h[k] = { nav_anchors: {}, guide_panes: {} } }

def parse_master_files
  puts "🔍 Scanning compiled master files in _source/..."
  
  Dir.glob("_source/*.md").each do |file_path|
    next if file_path.end_with?("_en.md") # Skip untranslated loose drafts
    
    content = File.read(file_path)
    
    # Extract legacy delimiter blocks dynamically tracking language and payload type
    sections = content.scan(/(===\s*(guide|pane)--([a-z]{2})--.*?===)\n(.*?)(?=(?:===\s*(?:guide|pane)--[a-z]{2})|\z)/m)
    
    sections.each do |full_match, type, lang, body|
      # Pull the isolated front matter block out of the current section element
      next unless body =~ /\A(---\s*\n.*?\n---\s*\n)/m
      
      begin
        fm_yaml = YAML.safe_load($1, permitted_classes: [Date, Time])
        next unless fm_yaml
        
        if type == 'guide'
          guide_id = fm_yaml['guide_id']
          title    = fm_yaml['title']
          subtitle = fm_yaml['subtitle']
          
          if guide_id && title && subtitle
            @ui_updates[lang][:guide_panes][guide_id] = { 'title' => title, 'subtitle' => subtitle }
          end
          
        elsif type == 'pane'
          parent_guide = fm_yaml['parent_guide']
          nav_id       = fm_yaml['nav_id']
          title        = fm_yaml['title']
          
          if parent_guide && nav_id && title
            variable_key = "#{parent_guide}_#{nav_id}"
            @ui_updates[lang][:nav_anchors][variable_key] = title
          end
        end
      rescue => e
        puts "⚠️ Failed parsing block front matter in #{File.basename(file_path)}: #{e.message}"
      end
    end
  end
end

def inject_nav_anchor(lines, key, value)
  # Look for a non-empty configuration declaration matching the key line prefix
  exists = lines.any? { |l| l =~ /^\s+#{Regexp.escape(key)}:\s*["']?[^"'\s]+["']?/ }
  return if exists

  # Erase placeholder empty markers if they exist to re-add cleanly
  lines.reject! { |l| l =~ /^\s+#{Regexp.escape(key)}:\s*(?:""|''|\s*)$/ }

  # Locate primary nav_anchors target element
  idx = lines.index { |l| l =~ /^nav_anchors:\s*$/ }
  if idx
    lines.insert(idx + 1, "  #{key}: #{value.to_json}\n")
    return true
  end
  false
end

def inject_guide_pane(lines, guide_id, title, subtitle)
  # Check if child item block declaration exists
  idx_guide = lines.index { |l| l =~ /^(\s+)#{Regexp.escape(guide_id)}:\s*$/ }
  
  if idx_guide
    has_content = false
    # Review nested children mapping entries to check if elements exist
    (idx_guide + 1..idx_guide + 4).each do |i|
      break if lines[i].nil? || lines[i] =~ /^\s{2,4}\w+:/
      has_content = true if lines[i] =~ /(title|subtitle):\s*["']?[^"'\s]+/
    end
    return if has_content # Skip modifying if already initialized and filled
    
    # Drop stale empty objects elements to overwrite cleanly
    while lines[idx_guide + 1] && lines[idx_guide + 1] =~ /^\s{6}/
      lines.delete_at(idx_guide + 1)
    end
    lines.delete_at(idx_guide)
  end

  # Find guide_panes container line element block
  idx_panes = lines.index { |l| l =~ /^\s+guide_panes:\s*$/ }
  if idx_panes
    indent = lines[idx_panes].match(/^(\s+)/)[1]
    child_indent = indent + "  "
    grandchild_indent = child_indent + "  "
    
    block = [
      "#{child_indent}#{guide_id}:\n",
      "#{grandchild_indent}title: #{title.to_json}\n",
      "#{grandchild_indent}subtitle: #{subtitle.to_json}\n"
    ]
    lines.insert(idx_panes + 1, *block)
    return true
  end
  false
end

def run_synchronizer
  parse_master_files
  
  if @ui_updates.empty?
    puts "✅ No updates found or pending. Execution complete."
    return
  end
  
  @ui_updates.each do |lang, target_blocks|
    yml_path = "_data/#{lang}/ui.yml"
    
    unless File.exist?(yml_path)
      puts "⚠️ Target config file data missing, skipping path target: #{yml_path}"
      next
    end
    
    lines = File.readlines(yml_path)
    modified = false
    
    puts "⚙️ Processing Language Target: [#{lang.upcase}] -> #{yml_path}"
    
    # 1. Update Navigation Anchors Items Map
    target_blocks[:nav_anchors].each do |key, value|
      if inject_nav_anchor(lines, key, value)
        puts "   ➕ Injected Nav Anchor: '#{key}' => \"#{value}\""
        modified = true
      end
    end
    
    # 2. Update Global Main Guide Panes Items Map
    target_blocks[:guide_panes].each do |guide_id, data|
      if inject_guide_pane(lines, guide_id, data['title'], data['subtitle'])
        puts "   ➕ Injected Guide Pane Entry: '#{guide_id}' [#{data['title']}]"
        modified = true
      end
    end
    
    if modified
      File.write(yml_path, lines.join)
      puts "💾 Saved updates to config: #{yml_path}"
    else
      puts "   • Content current. No alterations required."
    end
  end
  puts "🚀 Synchronization protocol finalized successfully."
end

run_synchronizer