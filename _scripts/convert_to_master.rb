require 'fileutils'

# Force real-time log output
$stdout.sync = true

# Primary data structure to hold our aggregated map
# Structure: master_registry[guide_id][lang] = { category: cat, content: text, panes: [] }
master_registry = Hash.new { |h, k| h[k] = Hash.new }

puts "🔍 Scanning distributed regional guides..."

# 1. Gather all Main Guide layout files
Dir.glob("guides/**/*.md").each do |guide_path|
  # Expected Path: guides/{lang}/{category}/{guide_id}.md
  parts = guide_path.split('/')
  next if parts.length < 4

  lang     = parts[1]
  category = parts[2]
  guide_id = File.basename(parts[3], ".md")

  content = File.read(guide_path).gsub("\r\n", "\n").strip

  master_registry[guide_id][lang] = {
    category: category,
    content: content,
    panes: []
  }
end

puts "🔍 Scanning distributed collection guide panes..."

# 2. Gather all matching Child Pane files
Dir.glob("collections/_guide_panes/**/*.md").each do |pane_path|
  # Expected Path: collections/_guide_panes/{lang}/{category}/{guide_id}/{step}-{pane_name}.md
  parts = pane_path.split('/')
  next if parts.length < 6

  lang     = parts[2]
  category = parts[3]
  guide_id = parts[4]
  filename = File.basename(parts[5], ".md")

  # Split the file name at the first hyphen to isolate the step counter from the identifier name
  name_parts = filename.split('-', 2)
  step       = name_parts[0]
  pane_name  = name_parts[1] || ""

  content = File.read(pane_path).gsub("\r\n", "\n").strip

  # Defensive check: ensure the base guide structure container entry exists in our tracking registry
  master_registry[guide_id][lang] ||= { category: category, content: "", panes: [] }
  
  master_registry[guide_id][lang][:panes] << {
    step: step,
    pane_name: pane_name,
    content: content
  }
end

# 3. Compile data tracks and write unified master file payloads
FileUtils.mkdir_p("_source")

puts "⚙️ Processing compilation and stitching operations..."

master_registry.each do |guide_id, languages|
  master_file_content = ""
  
  # Ensure the English payload layer is always compiled and written out first
  sorted_langs = languages.keys.sort do |a, b|
    if a == 'en' then -1
    elsif b == 'en' then 1
    else a <=> b
    end
  end

  sorted_langs.each do |lang|
    data = languages[lang]
    category = data[:category]

    # Stitch the parent guide record block
    if data[:content] && !data[:content].empty?
      master_file_content << "=== guide--#{lang}--#{category}--#{guide_id} ===\n"
      master_file_content << data[:content] << "\n\n"
    end

    # Sort the child panes numerically by their initial index sequence steps
    sorted_panes = data[:panes].sort_by { |p| p[:step] }

    # Stitch each individual child pane content block element
    sorted_panes.each do |pane|
      master_file_content << "=== pane--#{lang}--#{category}--#{guide_id}--#{pane[:step]}--#{pane[:pane_name]} ===\n"
      master_file_content << pane[:content] << "\n\n"
    end
  end

  # Save the finalized compiled single-file database asset
  output_path = "_source/#{guide_id}.md"
  File.write(output_path, master_file_content.strip + "\n")
  puts "💾 Reconstructed Master: #{output_path} (Languages: #{sorted_langs.join(', ')})"
end

puts "🚀 Remuxing operations finalized successfully. Check your _source/ folder."