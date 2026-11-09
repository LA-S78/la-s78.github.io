# Splits the multi-language master files in _source/ into the files Jekyll reads:
#   === page--name ===                       -> ./name.md
#   === collection--name--NN ===             -> collections/_name/NN-name.md
#   === guide--lang--category--name ===      -> guides/<lang>/<category>/<name>.md
#   === pane--lang--category--name--NN--id   -> collections/_guide_panes/<lang>/<category>/<name>/NN-id.md
#   <data lang="xx" name="file">             -> _data/<lang>/<file>.yml
# Everything it writes is generated: edit _source/*.md, never the outputs.
#
# Run via _scripts/build.rb (or directly: ruby _scripts/split_masters.rb).

require 'fileutils'
Encoding.default_external = Encoding::UTF_8
Dir.chdir(File.expand_path('..', __dir__))

puts "Starting format-agnostic segregation engine..."
Dir.glob("_source/**/*.md").each do |file_path|
  content = File.read(file_path)

  normalized_content = content.gsub(/<guide\s+lang="([^"]+)"\s+category="([^"]+)"\s+name="([^"]+)">/, "=== guide--\\1--\\2--\\3 ===")
  normalized_content = normalized_content.gsub(/<pane\s+lang="([^"]+)"\s+category="([^"]+)"\s+name="([^"]+)"\s+section="([^"]+)">/, "=== pane--\\1--\\2--\\3--\\4 ===")
  normalized_content = normalized_content.gsub(/<data\s+lang="([^"]+)"\s+name="([^"]+)">/, "=== data--\\1--\\2 ===")

  blocks = normalized_content.split(/^===\s*(\S+)\s*===/)
  next if blocks.length < 2

  (1...blocks.length).step(2) do |i|
    header = blocks[i].strip
    block_content = blocks[i+1].gsub("\r\n", "\n").strip
    next if block_content.empty?

    allowed_patterns = [
      /^page--\S+$/,
      /^collection--\S+--\d+$/,
      /^guide--\S+--\S+--\S+$/,
      /^pane--\S+--\S+--\S+--\S+$/,
      /^data--\S+--\S+$/
    ]
    unless allowed_patterns.any? { |p| header =~ p }
      raise "CRITICAL BUILD ERROR: Invalid header [#{header}]. Check markers!"
    end

    parts = header.split("--")
    type = parts[0].strip

    case type
    when "page"
      dest_file = "./#{parts[1].strip}.md"
    when "collection"
      dest_dir = "collections/_#{parts[1].strip}"
      dest_file = "#{dest_dir}/#{parts[2].strip}-#{parts[1].strip}.md"
    when "guide"
      lang, cat, name = parts[1], parts[2], parts[3]
      block_content = block_content.sub(/^---/, "---\nlang: #{lang}") unless block_content =~ /^lang:\s*/
      dest_dir = "guides/#{lang}/#{cat}"
      dest_file = "#{dest_dir}/#{name}.md"
    when "pane"
      lang, cat, name, step, pane = parts[1], parts[2], parts[3], parts[4], parts[5]
      dest_dir = "collections/_guide_panes/#{lang}/#{cat}/#{name}"
      dest_file = "#{dest_dir}/#{step}-#{pane}.md"
    when "data"
      lang, filename = parts[1].strip, parts[2].strip
      dest_dir = "_data/#{lang}"
      dest_file = "#{dest_dir}/#{filename}.yml"
    end

    # --- CLEAN UP CONTENT ---
    clean_content = block_content.gsub(/<\/?data[^>]*>/, "")
    clean_content = clean_content.gsub(/^```[a-z]*\n?/i, "").gsub(/\n?```$/, "").strip

    FileUtils.mkdir_p(File.dirname(dest_file))
    File.write(dest_file, clean_content + "\n")
    puts "✅ Segregated -> #{dest_file}"
  end
end
