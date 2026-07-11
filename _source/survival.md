=== guide--en--events--survival ===
---
layout: guides
title: Survival Battle
subtitle: Survival Battle
active_nav: guides
guide_id: "survival"
nav_links:
  - name_key: "survival_explanation"
    url: "#explanation"
  - name_key: "survival_schedule"
    url: "#schedule"
  - name_key: "survival_reference"
    url: "#reference"
---

{% for pane in site.guide_panes %}
  {% if pane.path contains 'survival/' and pane.lang == page.lang %}
    <section class="content-pane" id="{{ pane.nav_id }}">
      {{ pane.content }}
    </section>
  {% endif %}
{% endfor %}

=== pane--en--events--survival--01--explanation ===
---
title: "Survival Battle Explanation"
nav_id: "explanation"
parent_guide: "survival"
lang: "en"
order: 1
---

Survival Battle is a daily event with 12 participants from different servers grouped by similiar Sanctuary levels. The event is broken up into 4 hour increments of varied ways to score points. The first ranked player at the end of the event earns points towards their servers Kingdom War which helps gain the right to invade their opponents.

> #### ⚠️ Tips
> * Line up your Duel point scoring with Survival Battle to get double rewards and easy points. 
> * Construction and Research can be started at any time, spend enough in speed ups daily to earn points for your Survival battle and save the rest for the correct Duel day
> * Points awarded for research and construction completion are more beneificial for alliance duel ( Survival battle 1 point : 1 might increase, Alliance Duel 10 points : 1 might increase(increases with alliance duel research up to 30 point :1 might)).

=== pane--en--events--survival--02--schedule ===
---
title: "Survival Battle Schedule"
nav_id: "schedule"
parent_guide: "survival"
lang: "en"
order: 2
---

{% include survival_schedule.html %}

> #### ⚠️ Please Note
> 
> The schedule's days are based on the Alliance Duel calendar, **NOT** the Survival Battle calendar.

=== pane--en--events--survival--03--reference ===
---
title: "Points Reference"
nav_id: "reference"
parent_guide: "survival"
lang: "en"
order: 3
---

{% include points_reference.html lang=page.lang %}

=== guide--de--events--survival ===
---
layout: guides
title: "Überlebenskampf"
subtitle: "Überlebenskampf"
active_nav: guides
guide_id: "survival"
nav_links:
  - name_key: "survival_explanation"
    url: "#explanation"
  - name_key: "survival_schedule"
    url: "#schedule"
  - name_key: "survival_reference"
    url: "#reference"
---

{% for pane in site.guide_panes %}
  {% if pane.path contains 'survival/' and pane.lang == page.lang %}
    <section class="content-pane" id="{{ pane.nav_id }}">
      {{ pane.content }}
    </section>
  {% endif %}
{% endfor %}

=== pane--de--events--survival--01--explanation ===
---
title: "Erklärung zum Überlebenskampf"
nav_id: "explanation"
parent_guide: "survival"
lang: "de"
order: 1
---

Beschreibung folgt hier...

=== pane--de--events--survival--02--schedule ===
---
title: "Zeitplan für den Überlebenskampf"
nav_id: "schedule"
parent_guide: "survival"
lang: "de"
order: 2
---

{% include survival_schedule.html %}

> #### ⚠️ Bitte beachten
> 
> Die Tage des Zeitplans basieren auf dem Kalender des Allianz-Duells, **NICHT** auf dem Kalender des Überlebenskampfes.

=== pane--de--events--survival--03--reference ===
---
title: "Punkte-Referenz"
nav_id: "reference"
parent_guide: "survival"
lang: "de"
order: 3
---

{% include points_reference.html lang=page.lang %}

=== guide--es--events--survival ===
---
layout: guides
title: "Batalla de Supervivencia"
subtitle: "Batalla de Supervivencia"
active_nav: guides
guide_id: "survival"
nav_links:
  - name_key: "survival_explanation"
    url: "#explanation"
  - name_key: "survival_schedule"
    url: "#schedule"
  - name_key: "survival_reference"
    url: "#reference"
---

{% for pane in site.guide_panes %}
  {% if pane.path contains 'survival/' and pane.lang == page.lang %}
    <section class="content-pane" id="{{ pane.nav_id }}">
      {{ pane.content }}
    </section>
  {% endif %}
{% endfor %}

=== pane--es--events--survival--01--explanation ===
---
title: "Explicación de la Batalla de Supervivencia"
nav_id: "explanation"
parent_guide: "survival"
lang: "es"
order: 1
---

El texto va aquí...

=== pane--es--events--survival--02--schedule ===
---
title: "Horario de la Batalla de Supervivencia"
nav_id: "schedule"
parent_guide: "survival"
lang: "es"
order: 2
---

{% include survival_schedule.html %}

> #### ⚠️ Ten en cuenta
> 
> Los días del horario se basan en el calendario del Duelo de Alianzas, **NO** en el calendario de la Batalla de Supervivencia.

=== pane--es--events--survival--03--reference ===
---
title: "Referencia de Puntos"
nav_id: "reference"
parent_guide: "survival"
lang: "es"
order: 3
---

{% include points_reference.html lang=page.lang %}

=== guide--fr--events--survival ===
---
layout: guides
title: "Bataille de Survie"
subtitle: "Bataille de Survie"
active_nav: guides
guide_id: "survival"
nav_links:
  - name_key: "survival_explanation"
    url: "#explanation"
  - name_key: "survival_schedule"
    url: "#schedule"
  - name_key: "survival_reference"
    url: "#reference"
---

{% for pane in site.guide_panes %}
  {% if pane.path contains 'survival/' and pane.lang == page.lang %}
    <section class="content-pane" id="{{ pane.nav_id }}">
      {{ pane.content }}
    </section>
  {% endif %}
{% endfor %}

=== pane--fr--events--survival--01--explanation ===
---
title: "Explication de la Bataille de Survie"
nav_id: "explanation"
parent_guide: "survival"
lang: "fr"
order: 1
---

Le texte va ici...

=== pane--fr--events--survival--02--schedule ===
---
title: "Calendrier de la Bataille de Survie"
nav_id: "schedule"
parent_guide: "survival"
lang: "fr"
order: 2
---

{% include survival_schedule.html %}

> #### ⚠️ Veuillez noter
> 
> Les jours du calendrier sont basés sur le calendrier du Duel d'Alliance, et **NON** sur celui de la Bataille de Survie.

=== pane--fr--events--survival--03--reference ===
---
title: "Référence des Points"
nav_id: "reference"
parent_guide: "survival"
lang: "fr"
order: 3
---

{% include points_reference.html lang=page.lang %}

=== guide--it--events--survival ===
---
layout: guides
title: "Battaglia di Sopravvivenza"
subtitle: "Battaglia di Sopravvivenza"
active_nav: guides
guide_id: "survival"
nav_links:
  - name_key: "survival_explanation"
    url: "#explanation"
  - name_key: "survival_schedule"
    url: "#schedule"
  - name_key: "survival_reference"
    url: "#reference"
---

{% for pane in site.guide_panes %}
  {% if pane.path contains 'survival/' and pane.lang == page.lang %}
    <section class="content-pane" id="{{ pane.nav_id }}">
      {{ pane.content }}
    </section>
  {% endif %}
{% endfor %}

=== pane--it--events--survival--01--explanation ===
---
title: "Spiegazione della Battaglia di Sopravvivenza"
nav_id: "explanation"
parent_guide: "survival"
lang: "it"
order: 1
---

Il testo va qui...

=== pane--it--events--survival--02--schedule ===
---
title: "Programma della Battaglia di Sopravvivenza"
nav_id: "schedule"
parent_guide: "survival"
lang: "it"
order: 2
---

{% include survival_schedule.html %}

> #### ⚠️ Nota Bene
> 
> I giorni del programma si basano sul calendario del Duello dell'Alleanza, **NON** su quello della Battaglia di Sopravvivenza.

=== pane--it--events--survival--03--reference ===
---
title: "Riferimento Punti"
nav_id: "reference"
parent_guide: "survival"
lang: "it"
order: 3
---

{% include points_reference.html lang=page.lang %}

=== guide--ru--events--survival ===
---
layout: guides
title: "Битва за Выживание"
subtitle: "Битва за Выживание"
active_nav: guides
guide_id: "survival"
nav_links:
  - name_key: "survival_explanation"
    url: "#explanation"
  - name_key: "survival_schedule"
    url: "#schedule"
  - name_key: "survival_reference"
    url: "#reference"
---

{% for pane in site.guide_panes %}
  {% if pane.path contains 'survival/' and pane.lang == page.lang %}
    <section class="content-pane" id="{{ pane.nav_id }}">
      {{ pane.content }}
    </section>
  {% endif %}
{% endfor %}

=== pane--ru--events--survival--01--explanation ===
---
title: "Объяснение Битвы за Выживание"
nav_id: "explanation"
parent_guide: "survival"
lang: "ru"
order: 1
---

Текст будет здесь...

=== pane--ru--events--survival--02--schedule ===
---
title: "Расписание Битвы за Выживание"
nav_id: "schedule"
parent_guide: "survival"
lang: "ru"
order: 2
---

{% include survival_schedule.html %}

> #### ⚠️ Обратите внимание
> 
> Дни в расписании основаны на календаре Дуэли Альянсов, а **НЕ** на календаре Битвы за Выживание.

=== pane--ru--events--survival--03--reference ===
---
title: "Справка по Очкам"
nav_id: "reference"
parent_guide: "survival"
lang: "ru"
order: 3
---

{% include points_reference.html lang=page.lang %}

=== guide--tr--events--survival ===
---
layout: guides
title: "Hayatta Kalma Savaşı"
subtitle: "Hayatta Kalma Savaşı"
active_nav: guides
guide_id: "survival"
nav_links:
  - name_key: "survival_explanation"
    url: "#explanation"
  - name_key: "survival_schedule"
    url: "#schedule"
  - name_key: "survival_reference"
    url: "#reference"
---

{% for pane in site.guide_panes %}
  {% if pane.path contains 'survival/' and pane.lang == page.lang %}
    <section class="content-pane" id="{{ pane.nav_id }}">
      {{ pane.content }}
    </section>
  {% endif %}
{% endfor %}

=== pane--tr--events--survival--01--explanation ===
---
title: "Hayatta Kalma Savaşı Açıklaması"
nav_id: "explanation"
parent_guide: "survival"
lang: "tr"
order: 1
---

Açıklama buraya gelecek...

=== pane--tr--events--survival--02--schedule ===
---
title: "Hayatta Kalma Savaşı Programı"
nav_id: "schedule"
parent_guide: "survival"
lang: "tr"
order: 2
---

{% include survival_schedule.html %}

> #### ⚠️ Lütfen Dikkat
> 
> Programdaki günler Hayatta Kalma Savaşı takvimine **DEĞİL**, İttifak Düellosu takvimine dayanmaktadır.

=== pane--tr--events--survival--03--reference ===
---
title: "Puan Referansı"
nav_id: "reference"
parent_guide: "survival"
lang: "tr"
order: 3
---

{% include points_reference.html lang=page.lang %}

=== guide--uk--events--survival ===
---
layout: guides
title: "Битва за Виживання"
subtitle: "Битва за Виживання"
active_nav: guides
guide_id: "survival"
nav_links:
  - name_key: "survival_explanation"
    url: "#explanation"
  - name_key: "survival_schedule"
    url: "#schedule"
  - name_key: "survival_reference"
    url: "#reference"
---

{% for pane in site.guide_panes %}
  {% if pane.path contains 'survival/' and pane.lang == page.lang %}
    <section class="content-pane" id="{{ pane.nav_id }}">
      {{ pane.content }}
    </section>
  {% endif %}
{% endfor %}

=== pane--uk--events--survival--01--explanation ===
---
title: "Пояснення Битви за Виживання"
nav_id: "explanation"
parent_guide: "survival"
lang: "uk"
order: 1
---

Текст буде тут...

=== pane--uk--events--survival--02--schedule ===
---
title: "Розклад Битви за Виживання"
nav_id: "schedule"
parent_guide: "survival"
lang: "uk"
order: 2
---

{% include survival_schedule.html %}

> #### ⚠️ Зверніть увагу
> 
> Дні в розкладі засновані на календарі Дуелі Альянсів, а **НЕ** на календарі Битви за Виживання.

=== pane--uk--events--survival--03--reference ===
---
title: "Довідка по Очках"
nav_id: "reference"
parent_guide: "survival"
lang: "uk"
order: 3
---

{% include points_reference.html lang=page.lang %}
