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
title: "Überlebenskampf Erklärung"
nav_id: "explanation"
parent_guide: "survival"
lang: "de"
order: 1
---

Der Überlebenskampf (Survival Battle) ist ein tägliches Event mit 12 Teilnehmern von verschiedenen Servern, die nach ähnlichen Zufluchtsstufen (Sanctuary) gruppiert sind. Das Event ist in 4-Stunden-Schritte mit unterschiedlichen Möglichkeiten zur Punkteerzielung unterteilt. Der bestplatzierte Spieler am Ende des Events verdient Punkte für den Königreicheskrieg (Kingdom War) seines Servers, was dabei hilft, das Recht zur Invasion der Gegner zu erlangen.

> #### ⚠️ Tipps
> * Stimme deine Duell-Punkteerzielung mit dem Überlebenskampf ab, um doppelte Belohnungen und einfache Punkte zu erhalten.
> * Bau und Forschung können jederzeit gestartet werden. Nutze täglich genug Beschleuniger, um Punkte für deinen Überlebenskampf zu verdienen, und spare den Rest für den richtigen Duell-Tag auf.
> * Punkte, die für den Abschluss von Forschung und Bau vergeben werden, sind für das Allianzen-Duell vorteilhafter (Überlebenskampf 1 Punkt : 1 Machtsteigerung, Allianzen-Duell 10 Punkte : 1 Machtsteigerung (steigt mit Allianzen-Duell-Forschung auf bis zu 30 Punkte : 1 Macht)).

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

La Batalla de Supervivencia (Survival Battle) es un evento diario con 12 participantes de diferentes servidores agrupados por niveles similares de Santuario (Sanctuary). El evento se divide en incrementos de 4 horas con variadas formas de sumar puntos. El jugador que quede en primer lugar al final del evento gana puntos para la Guerra de Reinos (Kingdom War) de su servidor, lo que ayuda a obtener el derecho de invadir a sus oponentes.

> #### ⚠️ Consejos
> * Sincroniza tu puntuación del Duelo con la Batalla de Supervivencia para obtener el doble de recompensas y puntos fáciles.
> * La construcción y la investigación se pueden iniciar en cualquier momento; gasta suficientes aceleradores diariamente para ganar puntos en tu Batalla de Supervivencia y guarda el resto para el día de Duelo correcto.
> * Los puntos otorgados por completar investigaciones y construcciones son más beneficiosos para el Duelo de Alianzas (Batalla de Supervivencia 1 punto : 1 aumento de poder, Duelo de Alianzas 10 puntos : 1 aumento de poder (aumenta con la investigación de duelo de alianzas hasta 30 puntos : 1 de poder)).

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
title: "Explication du Combat de Survie"
nav_id: "explanation"
parent_guide: "survival"
lang: "fr"
order: 1
---

Le Combat de Survie (Survival Battle) est un événement quotidien réunissant 12 participants de différents serveurs regroupés par niveaux de Sanctuaire (Sanctuary) similaires. L'événement est divisé en tranches de 4 heures avec différentes manières de marquer des points. Le joueur classé premier à la fin de l'événement gagne des points pour la Guerre des Royaumes (Kingdom War) de son serveur, ce qui aide à obtenir le droit d'envahir ses adversaires.

> #### ⚠️ Astuces
> * Alignez vos gains de points de Duel avec le Combat de Survie pour obtenir des récompenses doubles et des points faciles.
> * La construction et la recherche peuvent être lancées à tout moment, dépensez suffisamment d'accélérateurs chaque jour pour gagner des points pour votre Combat de Survie et économisez le reste pour le bon jour de Duel.
> * Les points attribués pour la fin des recherches et des constructions sont plus avantageux pour le Duel d'Alliances (Combat de Survie 1 point : 1 augmentation de puissance, Duel d'Alliances 10 points : 1 augmentation de puissance (auglmente avec la recherche de duel d'alliances jusqu'à 30 points : 1 de puissance)).

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

La Battaglia di Sopravvivenza (Survival Battle) è un evento giornaliero con 12 partecipanti provenienti da diversi server raggruppati per livelli di Santuario (Sanctuary) simili. L'evento è suddiviso in incrementi di 4 ore con vari modi per guadagnare punti. Il giocatore che si classifica al primo posto alla fine dell'evento guadagna punti per la Guerra dei Regni (Kingdom War) del proprio server, il che aiuta a ottenere il diritto di invaderne gli avversari.

> #### ⚠️ Consigli
> * Allinea il tuo punteggio del Duello con la Battaglia di Sopravvivenza per ottenere doppie ricompense e punti facili.
> * La costruzione e la ricerca possono essere avviate in qualsiasi momento; spendi abbastanza acceleratori ogni giorno per guadagnare punti per la tua Battaglia di Sopravvivenza e conserva il resto per il giorno di Duello corretto.
> * I punti assegnati per il completamento di ricerche e costruzioni sono più vantaggiosi per il Duello di Alleanze (Battaglia di Sopravvivenza 1 punto : 1 aumento di potere, Duello di Alleanze 10 punti : 1 aumento di potere (aumenta con la ricerca del duello di alleanze fino a 30 punti : 1 potere)).

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
title: "Описание Битвы за Выживание"
nav_id: "explanation"
parent_guide: "survival"
lang: "ru"
order: 1
---

Битва за Выживание (Survival Battle) — это ежедневное событие с 12 участниками с разных серверов, сгруппированными по похожему уровню Убежища (Sanctuary). Событие разбито на 4-часовые интервалы с различными способами набора очков. Игрок, занаявший первое место по окончании события, зарабатывает очки для Войны Королевств (Kingdom War) своего сервера, что помогает получить право на вторжение к противникам.

> #### ⚠️ Советы
> * Совмещайте набор очков в Дуэли с Битвой за Выживание, чтобы получать двойные награды и легкие очки.
> * Строительство и исследования можно начинать в любое время, тратьте достаточно ускорений ежедневно, чтобы зарабатывать очки в Битве за Выживание, а остальное сохраняйте для нужного дня Дуэли.
> * Очки, начисляемые за завершение исследований и строительства, более выгодны для Дуэли Альянсов (Битва за Выживание 1 очко : 1 увеличение мощи, Дуэль Альянсов 10 очков : 1 увеличение мощи (увеличивается с исследованиями дуэли альянсов до 30 очков : 1 мощи)).

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

Hayatta Kalma Savaşı (Survival Battle), benzer Sığınak (Sanctuary) seviyelerine göre gruplandırılmış farklı sunuculardan 12 katılımcının yer aldığı günlük bir etkinliktir. Etkinlik, puan kazanmanın çeşitli yollarını içeren 4 saatlik artışlara bölünmüştür. Etkinliğin sonunda birinci sırada yer alan oyuncu, sunucusunun Krallık Savaşı (Kingdom War) için puan kazanır ve bu da rakiplerini işgal etme hakkı elde etmeye yardımcı olur.

> #### ⚠️ İpuçları
> * Çifte ödül ve kolay puanlar elde etmek için Düello puan kazanma sürecinizi Hayatta Kalma Savaşı ile eşleştirin.
> * İnşaat ve Araştırma her an başlatılabilir; Hayatta Kalma Savaşınız için puan kazanmaya yetecek kadar günlük hızlandırma harcayın ve geri kalanını doğru Düello günü için saklayın.
> * Araştırma ve inşaat tamamlaması için verilen puanlar ittifak düellosu için daha avantajlıdır (Hayatta Kalma Savaşı 1 puan : 1 güç artışı, İttifak Düellosu 10 puan : 1 güç artışı (ittifak düellosu araştırması ile 30 puan : 1 güce kadar yükselir)).

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

Битва за Виживання (Survival Battle) — це щоденна подія з 12 учасниками з різних серверів, згрупованими за схожими рівнями Сховища (Sanctuary). Подія розбита на 4-годинні інтервали з різними способами набору очок. Гравець, який посяде перше місце в кінці події, заробляє очки для Війни Королевств (Kingdom War) свого сервера, що допомагає отримати право на вторгнення до суперників.

> #### ⚠️ Поради
> * Поєднуйте набір очок у Дуелі з Битвою за Виживання, щоб отримувати подвійні нагороди та легкі очки.
> * Будівництво та дослідження можна починати в будь-який час, витрачайте достатньо прискорювачів щодня, щоб заробляти очки для своєї Битви за Виживання, а решту зберігайте для правильного дня Дуелі.
> * Очки, що нараховуються за завершення досліджень і будівництва, більш вигідні для Дуелі Альянсів (Битва за Виживання 1 очко : 1 збільшення моці, Дуель Альянсів 10 очок : 1 збільшення моці (збільшується з дослідженнями дуелі альянсів до 30 очок : 1 моці)).

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
> Дні в розкладі засновані на календарі Дуєлі Альянсів, а **НЕ** на календарі Битви за Виживання.

=== pane--uk--events--survival--03--reference ===
---
title: "Довідка по Очках"
nav_id: "reference"
parent_guide: "survival"
lang: "uk"
order: 3
---

{% include points_reference.html lang=page.lang %}