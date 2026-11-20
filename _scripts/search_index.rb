require 'cgi'
require 'json'

# Writes /<lang>/search-index.json for the site search (js/main.js, initSearchEngine): every
# section of the guides, the Rules page and the Alliance page, read from the FINISHED pages
# (so it holds exactly the text readers see, includes and data files filled in, in each
# language). One entry per `<section class="content-pane" id="…">`:
#   { "p": page title, "s": section name (its tab), "u": "/en/guides/duel.html#rules",
#     "x": the section's text }
# The service worker keeps the reader's language's index for offline use (precache_list.rb).
# Live data (ranks, the calendar) is filled in by scripts after loading, so it isn't in here.
module SearchIndex
  # Pages searched, relative to a language folder. Guide index, home, calendar, map and the
  # leader tools are left out: their content is cards, live data or forms.
  PAGES = ['rules.html', 'alliance.html', 'guides/*.html'].freeze
  # The guides index is cards; the writers guide is a how-to full of made-up example text.
  SKIP = ['guides/index.html', 'guides/writers.html'].freeze
  MAX_TEXT = 4000 # characters kept per section (the longest guide sections are ~3000)

  SECTION_OPEN = /<section\b[^>]*\bclass="[^"]*\bcontent-pane\b[^"]*"[^>]*>/

  # Text of a piece of HTML: no scripts, styles, icons, zoom dialogs (they repeat a picture
  # already in the section) or controls (button and menu labels); tags become spaces;
  # entities decoded.
  def self.text_of(html)
    html = html.gsub(%r{<(script|style|svg|dialog|template|button|select|label)\b.*?</\1>}mi, ' ')
    html = html.gsub(/<[^>]+>/, ' ')
    CGI.unescapeHTML(html).gsub(/\s+/, ' ').strip
  end

  # The section's closing tag, allowing for sections inside it.
  def self.section_end(html, from)
    depth = 1
    pos = from
    while depth.positive?
      nxt = html.index(%r{<section\b|</section>}, pos)
      return html.length unless nxt

      if html[nxt, 2] == '</'
        depth -= 1
        pos = nxt + 10
      else
        depth += 1
        pos = nxt + 8
      end
    end
    pos - 10
  end

  def self.entries_for(file, url)
    html = File.read(file, encoding: 'UTF-8')
    title = html[%r{<title>(.*?)</title>}m, 1].to_s
    title = CGI.unescapeHTML(title.split(' | ').first.to_s.strip)
    main = html[%r{<main\b.*</main>}m] || html
    entries = []
    pos = 0
    while (m = SECTION_OPEN.match(main, pos))
      id = m[0][/\bid="([^"]+)"/, 1]
      stop = section_end(main, m.end(0))
      pos = m.end(0)
      next unless id

      body = main[m.end(0)...stop]
      # The section's name: its tab under the header, else its first heading
      label = html[%r{<a\b[^>]*href="#{Regexp.escape("##{id}")}"[^>]*class="[^"]*anchor-link[^"]*"[^>]*>(.*?)</a>}m, 1] ||
              html[%r{<a\b[^>]*class="[^"]*anchor-link[^"]*"[^>]*href="#{Regexp.escape("##{id}")}"[^>]*>(.*?)</a>}m, 1] ||
              body[%r{<h[2-4]\b[^>]*>(.*?)</h[2-4]>}m, 1] || ''
      text = text_of(body)
      next if text.length < 20

      entries << { p: title, s: text_of(label), u: "#{url}##{id}", x: text[0, MAX_TEXT] }
    end
    entries
  end

  def self.run(site, langs)
    langs.each do |lang|
      root = File.join(site, lang)
      next unless Dir.exist?(root)

      files = PAGES.flat_map { |pattern| Dir.glob(File.join(root, pattern)).sort }
      files.reject! { |f| SKIP.include?(f.delete_prefix("#{root}/")) }
      entries = files.flat_map do |f|
        entries_for(f, "/#{lang}/#{f.delete_prefix("#{root}/")}")
      end
      out = File.join(root, 'search-index.json')
      File.write(out, JSON.generate(entries))
      puts "#{lang}/search-index.json: #{entries.size} sections from #{files.size} pages " \
           "(#{(File.size(out) / 1024.0).round} KB)"
    end
  end
end
