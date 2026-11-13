# The tools' text in the page's language (_data/<lang>/tools.yml, translated from
# _data/en/tools.yml by _scripts/translate_sections.rb), falling back to English for
# anything not translated yet.
#
# In a page:   {{ "dashboard.title" | t }}                  escaped for HTML
#              {{ "dashboard.saved_by" | t: "name", who }}  fills {name}
#              {{ "calendar.times_shown" | t_html: "gt", html }}  fills {gt} with HTML
# For scripts: a page lists the sections its scripts use in its front matter
#              (`strings: [dashboard, widgets]`); the layout puts them in the page
#              (tool_strings_json) and js/i18n.js reads them: t('dashboard.title').
require 'cgi'
require 'json'

module ToolStrings
  def self.lookup(data, key)
    key.to_s.split('.').reduce(data) { |node, part| node.is_a?(Hash) ? node[part] : nil }
  end

  def self.sections(site, lang)
    site.data.dig(lang, 'tools') || {}
  end

  module Filters
    def t(key, *vars)
      text = tool_text(key)
      vars.each_slice(2) { |name, value| text = text.gsub("{#{name}}", value.to_s) }
      CGI.escapeHTML(text)
    end

    # As t, but the values are HTML put in after escaping (like th() in js/i18n.js):
    #   {{ "calendar.times_shown" | t_html: "gt", bold_game_time }}
    def t_html(key, *vars)
      text = CGI.escapeHTML(tool_text(key))
      vars.each_slice(2) { |name, value| text = text.gsub("{#{name}}", value.to_s) }
      text
    end

    def tool_text(key)
      site = @context.registers[:site]
      lang = site.config['active_lang'] || 'en'
      text = ToolStrings.lookup(ToolStrings.sections(site, lang), key)
      text = ToolStrings.lookup(ToolStrings.sections(site, 'en'), key) unless text.is_a?(String)
      return text if text.is_a?(String)

      Jekyll.logger.warn 'Tool strings:', "no English text for \"#{key}\" (_data/en/tools.yml)"
      key.to_s
    end

    # {"lang":"de","en":{section: …},"t":{section: …}} for the listed sections (+ common).
    def tool_strings_json(names)
      site = @context.registers[:site]
      lang = site.config['active_lang'] || 'en'
      list = (['common'] + Array(names)).map(&:to_s).uniq
      pick = ->(all) { list.to_h { |s| [s, all[s]] }.compact }
      json = JSON.generate(
        'lang' => lang,
        'en' => pick.call(ToolStrings.sections(site, 'en')),
        't' => lang == 'en' ? {} : pick.call(ToolStrings.sections(site, lang))
      )
      json.gsub('</', '<\/') # safe inside <script>
    end
  end
end

Liquid::Template.register_filter(ToolStrings::Filters)
