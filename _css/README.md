# Stylesheets

Each folder here becomes **one** stylesheet on the site:

| Folder          | Published as      | Used by                                   |
|-----------------|-------------------|-------------------------------------------|
| `_css/style/`   | `/css/style.css`  | Every page                                |
| `_css/portal/`  | `/css/portal.css` | Discord tool pages (`portal/`), on top of `style.css` |

`_scripts/build.rb` joins the `.css` files in each folder **in filename order**
(`05-…`, `10-…`, `15-…`) into the published file. Visitors still download a single
stylesheet; the pieces only exist to keep each part small and easy to find.

**Order matters.** In CSS, when two rules conflict, the one that comes *later* wins.
That's why the files are numbered, and why `90-media-queries.css` is last: its
phone/desktop rules must override the earlier ones.

**To add styles for a new feature:** create a file with a number between its
neighbours, e.g. `67-farming-guide.css` sits after `65-rewards.css` and before
`70-alliance-hierarchy.css`. Leave media queries in `90-media-queries.css` (or put a
feature's own `@media` blocks at the end of its file).

These are plain CSS files: no special syntax. Preview changes with
`bundle exec ruby _scripts/build.rb --lang=en --serve`.
