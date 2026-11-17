# Checks a translated guide (owner request, 2026-11-17): Gemini sometimes leaves the texts that
# sit inside the guide's structure in English (the section titles in each block's YAML, which
# also label the nav tabs; the subtitle; pictures' alt text) while translating the rest.
# Used by _scripts/generate_master.rb for new guides, and by its --fill mode for guides
# already translated.
#
#   GuideTextCheck.structure_matches?(english, translated)  same blocks, ids and order?
#   GuideTextCheck.untranslated(english, translated, lang)  { "0" => "Getting There", ... }
#   GuideTextCheck.apply(translated, { "0" => "So kommst du hin" })  the fixed text
#
# Only the '=== guide--<lang>--… ===' / '=== pane--<lang>--… ===' master format is handled.

require 'json'

module GuideTextCheck
  MARKER = /^=== ((?:guide|pane)--)([a-z]{2})(--.+?) ===\s*$/
  # Lines of a block's YAML that must come back exactly as in English (ids, links, order)
  STATIC = /^\s*(?:-\s*)?(nav_id|parent_guide|guide_id|order|layout|active_nav|name_key|url|dialogs|lang):/
  TEXT_FIELD = /^(title|subtitle):\s*(.*?)\s*$/
  ALT = /alt="([^"]*)"/

  module_function

  # The texts to check, in order: [block, kind, value], kind 'title', 'subtitle' or 'alt'.
  def items(text)
    out = []
    block = nil
    text.each_line do |line|
      if (m = line.match(MARKER))
        block = m[1] + m[3]
        next
      end
      next unless block

      if (m = line.match(TEXT_FIELD))
        out << [block, m[1], unquote(m[2])]
      end
      line.scan(ALT) { |(v)| out << [block, 'alt', v] }
    end
    out
  end

  # The blocks with their unchanging lines (language aside): equal for a sound translation
  def structure(text)
    blocks = []
    text.each_line do |line|
      if (m = line.match(MARKER))
        blocks << [m[1] + m[3], []]
      elsif blocks.any? && line =~ STATIC && line !~ /^\s*lang:/
        blocks.last[1] << line.strip
      end
    end
    blocks
  end

  def structure_matches?(english, translated)
    structure(english) == structure(translated)
  end

  # Values still word for word the English, by position: { "3" => "Getting Home" }. Not
  # counted: values with no letters, and terms the glossary keeps the same in this language.
  def untranslated(english, translated, lang, glossary = {})
    en = items(english)
    tr = items(translated)
    return {} unless en.map { |b, k, _| [b, k] } == tr.map { |b, k, _| [b, k] }

    todo = {}
    en.each_with_index do |(_, _, value), i|
      next unless tr[i][2] == value && value =~ /\p{L}/
      next if glossary.dig(value, lang) == value || value.strip.empty?

      todo[i.to_s] = value
    end
    todo
  end

  # The text with the values at those positions replaced
  def apply(text, replacements)
    return text if replacements.empty?

    i = -1
    block = nil
    text.each_line.map do |line|
      if line.match(MARKER)
        block = true
        next line
      end
      next line unless block

      if (m = line.match(TEXT_FIELD))
        i += 1
        new = replacements[i.to_s]
        line = "#{m[1]}: #{JSON.generate(new)}\n" if new
      end
      line.gsub(ALT) do
        i += 1
        new = replacements[i.to_s]
        new ? %(alt="#{new.gsub('"', '&quot;')}") : Regexp.last_match(0)
      end
    end.join
  end

  # The prompt for the second request: just the leftover texts, as JSON
  def prompt(todo, lang, glossary)
    <<~PROMPT
      Translate each value of this JSON object from English into the language with the code
      "#{lang}". They are a game guide's section titles, subtitle and picture descriptions.
      Keep the keys. Reply with the JSON object only.
      Use this glossary of game terms: #{glossary.to_json}

      #{JSON.pretty_generate(todo)}
    PROMPT
  end

  def unquote(value)
    v = value.strip
    if (v.start_with?('"') && v.end_with?('"')) || (v.start_with?("'") && v.end_with?("'"))
      v = v[1..-2]
      v = v.gsub('\\"', '"')
    end
    v
  end

  # A master file's text for one language (its guide and pane blocks)
  def language_part(master, lang)
    out = +''
    keep = false
    master.each_line do |line|
      if (m = line.match(MARKER))
        keep = m[2] == lang
      end
      out << line if keep
    end
    out
  end
end
