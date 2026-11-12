# The tools' text in the page's language (_data/<lang>/tools.yml, translated from
# _data/en/tools.yml by _scripts/translate_sections.rb), falling back to English for
# anything not translated yet.
#
# In a page:   {{ "dashboard.title" | t }}                  escaped for HTML
#              {{ "dashboard.saved_by" | t: "name", who }}  fills {name}
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
      site = @context.registers[:site]
      lang = site.config['active_lang'] || 'en'
      text = ToolStrings.lookup(ToolStrings.sections(site, lang), key)
      text = ToolStrings.lookup(ToolStrings.sections(site, 'en'), key) unless text.is_a?(String)
      unless text.is_a?(String)
        Jekyll.logger.warn 'Tool strings:', "no English text for \"#{key}\" (_data/en/tools.yml)"
        return CGI.escapeHTML(key.to_s)
      end
      vars.each_slice(2) { |name, value| text = text.gsub("{#{name}}", value.to_s) }
      CGI.escapeHTML(text)
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
