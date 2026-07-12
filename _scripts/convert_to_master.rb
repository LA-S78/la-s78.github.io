require 'yaml'
require 'fileutils'
require 'json'
require 'date'

# Force real-time log output streaming
$stdout.sync = true

# Primary data structure to hold our aggregated guide maps
master_registry = Hash.new { |h, k| h[k] = Hash.new }

# =====================================================================
# PHASE 1: COMPILING STANDARD GUIDES & PANES (TRIED & TESTED)
# =====================================================================
puts "🔍 Scanning distributed regional guides..."

Dir.glob("guides/**/*.md").each do |guide_path|
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

Dir.glob("collections/_guide_panes/**/*.md").each do |pane_path|
  parts = pane_path.split('/')
  next if parts.length < 6

  lang     = parts[2]
  category = parts[3]
  guide_id = parts[4]
  filename = File.basename(parts[5], ".md")

  name_parts = filename.split('-', 2)
  step       = name_parts[0]
  pane_name  = name_parts[1] || ""

  content = File.read(pane_path).gsub("\r\n", "\n").strip

  master_registry[guide_id][lang] ||= { category: category, content: "", panes: [] }
  
  master_registry[guide_id][lang][:panes] << {
    step: step,
    pane_name: pane_name,
    content: content
  }
end

# Create the source directory if it is missing
FileUtils.mkdir_p("_source")

puts "⚙️ Stitching Guide Master files..."

master_registry.each do |guide_id, languages|
  output_path = "_source/#{guide_id}.md"
  
  if File.exist?(output_path)
    puts "Skip: '#{output_path}' already exists. Protected."
    next
  end

  master_file_content = ""
  sorted_langs = languages.keys.sort { |a, b| a == 'en' ? -1 : (b == 'en' ? 1 : a <=> b) }

  sorted_langs.each do |lang|
    data = languages[lang]
    category = data[:category]

    if data[:content] && !data[:content].empty?
      master_file_content << "=== guide--#{lang}--#{category}--#{guide_id} ===\n"
      master_file_content << data[:content] << "\n\n"
    end

    sorted_panes = data[:panes].sort_by { |p| p[:step] }
    sorted_panes.each do |pane|
      master_file_content << "=== pane--#{lang}--#{category}--#{guide_id}--#{pane[:step]}--#{pane[:pane_name]} ===\n"
      master_file_content << pane[:content] << "\n\n"
    end
  end

  File.write(output_path, master_file_content.strip + "\n")
  puts "💾 Reconstructed Guide Master: #{output_path}"
end

# =====================================================================
# PHASE 2: COMPILING CORE PAGES & STRUCTURAL COLLECTIONS (FIXED INDEX)
# =====================================================================
puts "🔍 Scanning root pages and structural collections..."

# Defines the structural link between root pages and their corresponding sub-collections
DOMAIN_MAP = {
  '404'         => { page: '404.md',         dir: nil,                    collection_tag: nil },
  'alliance'    => { page: 'alliance.md',    dir: 'collections/_alliance',    collection_tag: 'alliance' },
  'rules'       => { page: 'rules.md',       dir: 'collections/_rules',       collection_tag: 'rules' },
  'index'       => { page: 'index.md',       dir: 'collections/_home',        collection_tag: 'home' },
  'guide_index' => { page: 'guide_index.md', dir: 'collections/_guide_index', collection_tag: 'guide_index' }
}

DOMAIN_MAP.each do |domain, paths|
  output_path = "_source/#{domain}.md"
  
  if File.exist?(output_path)
    puts "Skip: '#{output_path}' already exists. Protected."
    next
  end

  chunks = []

  # 1. Process and wrap the base root file if it exists
  if File.exist?(paths[:page])
    page_content = File.read(paths[:page]).gsub("\r\n", "\n").strip
    chunks << "=== page--#{domain} ===\n#{page_content}"
  end

  # 2. Process and wrap nested collection item shards
  if paths[:dir] && Dir.exist?(paths[:dir])
    Dir.glob("#{paths[:dir]}/*.md").sort.each do |col_path|
      filename = File.basename(col_path, ".md")
      
      # Extract the order step integer from the filename (e.g., "01" from "01-server-rules")
      if filename =~ /^(\d+)/
        step = $1
        col_content = File.read(col_path).gsub("\r\n", "\n").strip
        # Uses the decoupled backend collection_tag (e.g., 'home') rather than the file name 'index'
        chunks << "=== collection--#{paths[:collection_tag]}--#{step} ===\n#{col_content}"
      end
    end
  end

  # 3. Write out consolidated master source domain file
  unless chunks.empty?
    File.write(output_path, chunks.join("\n\n").strip + "\n")
    puts "💾 Reconstructed Domain Master: #{output_path}"
  end
end

# =====================================================================
# PHASE 3: THE WRITERS ANOMALY HANDLER (DEEP NESTED EDGE-CASE)
# =====================================================================
puts "🔍 Processing specialized writers guide edge-case..."

writers_master_path = "_source/writers.md"

if File.exist?(writers_master_path)
  puts "Skip: '#{writers_master_path}' already exists. Protected."
else
  writers_chunks = []

  # 1. Capture the root trigger page
  if File.exist?("guides/writers.md")
    content = File.read("guides/writers.md").gsub("\r\n", "\n").strip
    writers_chunks << "=== page--guides/writers ===\n#{content}"
  end

  # 2. Capture the main guide index collection entry
  if File.exist?("collections/_guide_index/04-writers.md")
    content = File.read("collections/_guide_index/04-writers.md").gsub("\r\n", "\n").strip
    writers_chunks << "=== page--collections/_guide_index/04-writers ===\n#{content}"
  end

  # 3. Recursively capture the deep nested pane shards
  deep_writers_dir = "collections/_guide_index/writers"
  if Dir.exist?(deep_writers_dir)
    Dir.glob("#{deep_writers_dir}/*.md").sort.each do |pane_path|
      filename = File.basename(pane_path, ".md")
      content = File.read(pane_path).gsub("\r\n", "\n").strip
      
      writers_chunks << "=== page--collections/_guide_index/writers/#{filename} ===\n#{content}"
    end
  end

  # 4. Write out the consolidated master file
  unless writers_chunks.empty?
    File.write(writers_master_path, writers_chunks.join("\n\n").strip + "\n")
    puts "💾 Reconstructed Anomaly Master: #{writers_master_path}"
  end
end

puts "🚀 Master database assembly finalized successfully."