=== guide--en--strategy--sanctuary ===
---
layout: guides
title: "Sanctuary Guide"
subtitle: "Leveling Guide"
active_nav: guides
guide_id: "sanctuary"
nav_links:
  - name_key: "sanctuary_strategy"
    url: "#strategy"
  - name_key: "sanctuary_chart"
    url: "#prereqs"
  - name_key: "sanctuary_goals"
    url: "#goals"
  - name_key: "sanctuary_efficiency"
    url: "#tips"
dialogs:
  - dialogs/guides/strategy/sanctuary.html
---

{% for pane in site.guide_panes %}
  {% if pane.path contains 'sanctuary/' and pane.lang == page.lang %}
    <section class="content-pane" id="{{ pane.nav_id }}">
      {{ pane.content }}
    </section>
  {% endif %}
{% endfor %}

=== pane--en--strategy--sanctuary--01--strategy ===
---
title: "Progression Strategy"
nav_id: "strategy"
parent_guide: "sanctuary"
lang: "en"
order: 1
---

Racing to Sanctuary Level 30 is the primary goal for long-term account strength, but rushing without planning causes "bottlenecks."

> #### ⚠️ Priority Intel
> 
> **Never start an upgrade without checking your prerequisites first.** You don't want to save 2 days of resources only to realize you forgot to level up the Laboratory or Training Grounds.

The progression shifts around Level 20. Before 20, progress is straightforward. After 20, you must prioritize the specific "Required Buildings" list, as these will become your primary time-sinks.

=== pane--en--strategy--sanctuary--02--prereqs ===
---
title: "Level Prerequisites Chart"
nav_id: "prereqs"
parent_guide: "sanctuary"
lang: "en"
order: 2
---

Use the chart below to plan your construction queue. This covers resource costs and specific structure requirements to prevent construction halts.

<img src="/images/guides/sanctuary-prereqs.jpg" alt="Sanctuary Level Prerequisites" class="blueprint-img" onclick="document.getElementById('sanctuary-prereqsZoom').showModal()" style="cursor: pointer;">

=== pane--en--strategy--sanctuary--03--goals ===
---
title: "Building Ceiling Goals"
nav_id: "goals"
parent_guide: "sanctuary"
lang: "en"
order: 3
---

Once you reach these levels, you have satisfied all prerequisite requirements for Sanctuary 30. You can deprioritize these buildings and reallocate your resources toward troops and tech.

{% include sanctuary_goals.html lang=page.lang %}

=== pane--en--strategy--sanctuary--04--efficiency ===
---
title: "Efficiency & Spending"
nav_id: "tips"
parent_guide: "sanctuary"
lang: "en"
order: 4
---

The transition from Level 25 to 30 represents the steepest climb in the game. To maintain momentum:

* **Construction Speed:** Ensure your "Building Speed" research is maxed out in the Laboratory. This provides a compounding bonus that saves weeks of time by Level 30.
* **Alignment:** Align your major building upgrades with the "Alliance Duel" event whenever possible to gain points for your efforts.
* **Titles:** Make sure to utilise Minister of Construction or Chief of Affairs before starting construction. These buffs can dramatically reduce construction times.

=== guide--de--strategy--sanctuary ===
---
layout: guides
title: "Heiligtums-Guide"
subtitle: "Level-Guide"
active_nav: guides
guide_id: "sanctuary"
lang: "de"
nav_links:
  - name_key: "sanctuary_strategy"
    url: "#strategy"
  - name_key: "sanctuary_chart"
    url: "#prereqs"
  - name_key: "sanctuary_goals"
    url: "#goals"
  - name_key: "sanctuary_efficiency"
    url: "#tips"
dialogs:
  - dialogs/guides/strategy/sanctuary.html
---

{% for pane in site.guide_panes %}
  {% if pane.path contains 'sanctuary/' and pane.lang == page.lang %}
    <section class="content-pane" id="{{ pane.nav_id }}">
      {{ pane.content }}
    </section>
  {% endif %}
{% endfor %}

=== pane--de--strategy--sanctuary--01--strategy ===
---
title: "Fortschrittsstrategie"
nav_id: "strategy"
parent_guide: "sanctuary"
lang: "de"
order: 1
---

Das Rennen zum Heiligtum auf Level 30 ist das Hauptziel für langfristige Accountstärke, aber übereiltes Vorgehen ohne Planung führt zu "Flaschenhälsen".

> #### ⚠️ Wichtige Info
> 
> **Starte niemals ein Upgrade, ohne vorher deine Voraussetzungen zu prüfen.** Du möchtest nicht 2 Tage an Ressourcen sparen, nur um dann festzustellen, dass du vergessen hast, das Labor oder das Trainingsgelände zu leveln.

Die Fortschrittsdynamik ändert sich etwa bei Level 20. Vor Level 20 ist der Fortschritt unkompliziert. Nach Level 20 musst du die Liste der "erforderlichen Gebäude" priorisieren, da diese zu deinen primären Zeitfressern werden.

=== pane--de--strategy--sanctuary--02--prereqs ===
---
title: "Level-Voraussetzungen"
nav_id: "prereqs"
parent_guide: "sanctuary"
lang: "de"
order: 2
---

Verwende die Tabelle unten, um deine Bauschlange zu planen. Sie deckt Ressourcenkosten und spezifische Gebäudeveraussetzungen ab, um Baustopps zu vermeiden.

<img src="/images/guides/sanctuary-prereqs.jpg" alt="Voraussetzungen Heiligtum-Level" class="blueprint-img" onclick="document.getElementById('sanctuary-prereqsZoom').showModal()" style="cursor: pointer;">

=== pane--de--strategy--sanctuary--03--goals ===
---
title: "Gebäude-Höchstziele"
nav_id: "goals"
parent_guide: "sanctuary"
lang: "de"
order: 3
---

Sobald du diese Level erreicht hast, hast du alle Voraussetzungen für das Heiligtum auf Level 30 erfüllt. Du kannst diese Gebäude dann de-priorisieren und deine Ressourcen in Truppen und Forschung investieren.

{% include sanctuary_goals.html lang=page.lang %}

=== pane--de--strategy--sanctuary--04--efficiency ===
---
title: "Effizienz & Ausgaben"
nav_id: "tips"
parent_guide: "sanctuary"
lang: "de"
order: 4
---

Der Übergang von Level 25 auf 30 ist der steilste Anstieg im Spiel. Um das Momentum beizubehalten:

* **Baugeschwindigkeit:** Stelle sicher, dass deine Forschung zur "Baugeschwindigkeit" im Labor maximiert ist. Dies bietet einen Zinseszinseffekt, der bis Level 30 Wochen an Zeit spart.
* **Abstimmung:** Stimme deine großen Gebäude-Upgrades nach Möglichkeit mit dem "Allianz-Duell" ab, um Punkte für deine Bemühungen zu erhalten.
* **Titel:** Nutze unbedingt den Minister für Bauwesen oder den Chef für Angelegenheiten, bevor du mit dem Bau beginnst. Diese Buffs können die Bauzeiten drastisch reduzieren.

=== guide--es--strategy--sanctuary ===
---
layout: guides
title: "Guía del Santuario"
subtitle: "Guía de Niveles"
active_nav: guides
guide_id: "sanctuary"
nav_links:
  - name_key: "sanctuary_strategy"
    url: "#strategy"
  - name_key: "sanctuary_chart"
    url: "#prereqs"
  - name_key: "sanctuary_goals"
    url: "#goals"
  - name_key: "sanctuary_efficiency"
    url: "#tips"
dialogs:
  - dialogs/guides/strategy/sanctuary.html
---

{% for pane in site.guide_panes %}
  {% if pane.path contains 'sanctuary/' and pane.lang == page.lang %}
    <section class="content-pane" id="{{ pane.nav_id }}">
      {{ pane.content }}
    </section>
  {% endif %}
{% endfor %}

=== pane--es--strategy--sanctuary--01--strategy ===
---
title: "Estrategia de Progresión"
nav_id: "strategy"
parent_guide: "sanctuary"
lang: "es"
order: 1
---

Correr hacia el Santuario Nivel 30 es el objetivo principal para la fuerza a largo plazo de tu cuenta, pero apresurarse sin planificar causa "cuellos de botella".

> #### ⚠️ Info Prioritaria
> 
> **Nunca inicies una mejora sin comprobar primero tus requisitos.** No querrás ahorrar 2 días de recursos solo para darte cuenta de que olvidaste subir de nivel el Laboratorio o el Campo de Entrenamiento.

La progresión cambia alrededor del Nivel 20. Antes del 20, el progreso es sencillo. Después del 20, debes priorizar la lista específica de "Edificios Requeridos", ya que se convertirán en tus principales sumideros de tiempo.

=== pane--es--strategy--sanctuary--02--prereqs ===
---
title: "Tabla de Requisitos de Nivel"
nav_id: "prereqs"
parent_guide: "sanctuary"
lang: "es"
order: 2
---

Usa la tabla a continuación para planificar tu cola de construcción. Esto cubre los costos de recursos y los requisitos específicos de las estructuras para evitar paradas en la construcción.

<img src="/images/guides/sanctuary-prereqs.jpg" alt="Requisitos de nivel del Santuario" class="blueprint-img" onclick="document.getElementById('sanctuary-prereqsZoom').showModal()" style="cursor: pointer;">

=== pane--es--strategy--sanctuary--03--goals ===
---
title: "Objetivos de Nivel de Edificios"
nav_id: "goals"
parent_guide: "sanctuary"
lang: "es"
order: 3
---

Una vez que alcanzas estos niveles, has satisfecho todos los requisitos previos para el Santuario Nivel 30. Puedes dejar de priorizar estos edificios y reasignar tus recursos hacia tropas y tecnología.

{% include sanctuary_goals.html lang=page.lang %}

=== pane--es--strategy--sanctuary--04--efficiency ===
---
title: "Eficiencia y Gastos"
nav_id: "tips"
parent_guide: "sanctuary"
lang: "es"
order: 4
---

La transición del Nivel 25 al 30 representa la escalada más empinada del juego. Para mantener el impulso:

* **Velocidad de Construcción:** Asegúrate de que tu investigación de "Velocidad de Construcción" esté al máximo en el Laboratorio. Esto proporciona una bonificación acumulativa que ahorra semanas de tiempo para el Nivel 30.
* **Alineación:** Alinea tus mejoras importantes de edificios con el evento "Duelo de Alianzas" siempre que sea posible para ganar puntos por tus esfuerzos.
* **Títulos:** Asegúrate de utilizar al Ministro de Construcción o al Jefe de Asuntos antes de comenzar la construcción. Estas mejoras pueden reducir drásticamente los tiempos de construcción.

=== guide--fr--strategy--sanctuary ===
---
layout: guides
title: "Guide du Sanctuaire"
subtitle: "Guide de Progression"
active_nav: guides
guide_id: "sanctuary"
nav_links:
  - name_key: "sanctuary_strategy"
    url: "#strategy"
  - name_key: "sanctuary_chart"
    url: "#prereqs"
  - name_key: "sanctuary_goals"
    url: "#goals"
  - name_key: "sanctuary_efficiency"
    url: "#tips"
dialogs:
  - dialogs/guides/strategy/sanctuary.html
---

{% for pane in site.guide_panes %}
  {% if pane.path contains 'sanctuary/' and pane.lang == page.lang %}
    <section class="content-pane" id="{{ pane.nav_id }}">
      {{ pane.content }}
    </section>
  {% endif %}
{% endfor %}

=== pane--fr--strategy--sanctuary--01--strategy ===
---
title: "Stratégie de Progression"
nav_id: "strategy"
parent_guide: "sanctuary"
lang: "fr"
order: 1
---

La course vers le Sanctuaire Niveau 30 est l'objectif principal pour la puissance à long terme de votre compte, mais se précipiter sans planifier crée des "goulots d'étranglement".

> #### ⚠️ Info Prioritaire
> 
> **Ne commencez jamais une amélioration sans vérifier vos prérequis.** Vous ne voudriez pas économiser 2 jours de ressources pour réaliser que vous avez oublié d'améliorer le Laboratoire ou le Terrain d'Entraînement.

La progression change vers le Niveau 20. Avant le niveau 20, la progression est simple. Après le niveau 20, vous devez prioriser la liste spécifique des "Bâtiments Requis", car ils deviendront vos principaux gouffres de temps.

=== pane--fr--strategy--sanctuary--02--prereqs ===
---
title: "Tableau des Prérequis de Niveau"
nav_id: "prereqs"
parent_guide: "sanctuary"
lang: "fr"
order: 2
---

Utilisez le tableau ci-dessous pour planifier votre file d'attente de construction. Cela couvre les coûts en ressources et les prérequis spécifiques aux structures pour éviter les arrêts de chantier.

<img src="/images/guides/sanctuary-prereqs.jpg" alt="Prérequis de niveau du Sanctuaire" class="blueprint-img" onclick="document.getElementById('sanctuary-prereqsZoom').showModal()" style="cursor: pointer;">

=== pane--fr--strategy--sanctuary--03--goals ===
---
title: "Objectifs de Niveau des Bâtiments"
nav_id: "goals"
parent_guide: "sanctuary"
lang: "fr"
order: 3
---

Une fois que vous atteignez ces niveaux, vous avez satisfait tous les prérequis pour le Sanctuaire Niveau 30. Vous pouvez déprioriser ces bâtiments et réallouer vos ressources vers les troupes et la technologie.

{% include sanctuary_goals.html lang=page.lang %}

=== pane--fr--strategy--sanctuary--04--efficiency ===
---
title: "Efficacité et Dépenses"
nav_id: "tips"
parent_guide: "sanctuary"
lang: "fr"
order: 4
---

La transition du niveau 25 au 30 représente la montée la plus raide du jeu. Pour maintenir l'élan :

* **Vitesse de Construction :** Assurez-vous que vos recherches sur la "Vitesse de Construction" sont maximisées dans le Laboratoire. Cela offre un bonus cumulatif qui économise des semaines de temps d'ici le Niveau 30.
* **Alignement :** Alignez vos améliorations majeures de bâtiments avec l'événement "Duel d'Alliance" autant que possible pour gagner des points pour vos efforts.
* **Titres :** Assurez-vous d'utiliser le Ministre de la Construction ou le Chef des Affaires avant de commencer la construction. Ces bonus peuvent réduire considérablement les temps de construction.

=== guide--it--strategy--sanctuary ===
---
layout: guides
title: "Guida al Santuario"
subtitle: "Guida al Livellamento"
active_nav: guides
guide_id: "sanctuary"
nav_links:
  - name_key: "sanctuary_strategy"
    url: "#strategy"
  - name_key: "sanctuary_chart"
    url: "#prereqs"
  - name_key: "sanctuary_goals"
    url: "#goals"
  - name_key: "sanctuary_efficiency"
    url: "#tips"
dialogs:
  - dialogs/guides/strategy/sanctuary.html
---

{% for pane in site.guide_panes %}
  {% if pane.path contains 'sanctuary/' and pane.lang == page.lang %}
    <section class="content-pane" id="{{ pane.nav_id }}">
      {{ pane.content }}
    </section>
  {% endif %}
{% endfor %}

=== pane--it--strategy--sanctuary--01--strategy ===
---
title: "Strategia di Progressione"
nav_id: "strategy"
parent_guide: "sanctuary"
lang: "it"
order: 1
---

La corsa verso il Santuario al livello 30 è l'obiettivo principale per la forza a lungo termine dell'account, ma affrettarsi senza pianificare causa "colli di bottiglia".

> #### ⚠️ Info Prioritaria
> 
> **Non iniziare mai un potenziamento senza aver prima controllato i prerequisiti.** Non vuoi risparmiare 2 giorni di risorse solo per renderti conto di aver dimenticato di far salire di livello il Laboratorio o il Campo di Addestramento.

La progressione cambia verso il livello 20. Prima del livello 20, il progresso è semplice. Dopo il livello 20, devi dare priorità alla lista specifica degli "Edifici Richiesti", poiché diventeranno i tuoi principali dispendi di tempo.

=== pane--it--strategy--sanctuary--02--prereqs ===
---
title: "Tabella dei Prerequisiti di Livello"
nav_id: "prereqs"
parent_guide: "sanctuary"
lang: "it"
order: 2
---

Usa la tabella sottostante per pianificare la tua coda di costruzione. Copre i costi delle risorse e i requisiti specifici delle strutture per evitare interruzioni nella costruzione.

<img src="/images/guides/sanctuary-prereqs.jpg" alt="Prerequisiti di livello del Santuario" class="blueprint-img" onclick="document.getElementById('sanctuary-prereqsZoom').showModal()" style="cursor: pointer;">

=== pane--it--strategy--sanctuary--03--goals ===
---
title: "Obiettivi di Livello Edifici"
nav_id: "goals"
parent_guide: "sanctuary"
lang: "it"
order: 3
---

Una volta raggiunti questi livelli, hai soddisfatto tutti i prerequisiti per il Santuario di livello 30. Puoi deprioritizzare questi edifici e riallocare le tue risorse verso truppe e tecnologia.

{% include sanctuary_goals.html lang=page.lang %}

=== pane--it--strategy--sanctuary--04--efficiency ===
---
title: "Efficienza e Spesa"
nav_id: "tips"
parent_guide: "sanctuary"
lang: "it"
order: 4
---

La transizione dal livello 25 al 30 rappresenta la scalata più ripida del gioco. Per mantenere lo slancio:

* **Velocità di Costruzione:** Assicurati che la tua ricerca sulla "Velocità di Costruzione" sia massimizzata nel Laboratorio. Ciò fornisce un bonus composto che fa risparmiare settimane di tempo entro il livello 30.
* **Allineamento:** Allinea i tuoi principali potenziamenti edilizi con l'evento "Duello dell'Alleanza" ogni volta che è possibile per guadagnare punti per i tuoi sforzi.
* **Titoli:** Assicurati di utilizzare il Ministro della Costruzione o il Capo degli Affari prima di iniziare la costruzione. Questi buff possono ridurre drasticamente i tempi di costruzione.

=== guide--ru--strategy--sanctuary ===
---
layout: guides
title: "Гайд по Святилищу"
subtitle: "Руководство по прокачке"
active_nav: guides
guide_id: "sanctuary"
nav_links:
  - name_key: "sanctuary_strategy"
    url: "#strategy"
  - name_key: "sanctuary_chart"
    url: "#prereqs"
  - name_key: "sanctuary_goals"
    url: "#goals"
  - name_key: "sanctuary_efficiency"
    url: "#tips"
dialogs:
  - dialogs/guides/strategy/sanctuary.html
---

{% for pane in site.guide_panes %}
  {% if pane.path contains 'sanctuary/' and pane.lang == page.lang %}
    <section class="content-pane" id="{{ pane.nav_id }}">
      {{ pane.content }}
    </section>
  {% endif %}
{% endfor %}

=== pane--ru--strategy--sanctuary--01--strategy ===
---
title: "Стратегия прогресса"
nav_id: "strategy"
parent_guide: "sanctuary"
lang: "ru"
order: 1
---

Гонка к Святилищу 30-го уровня — главная цель для долгосрочного развития аккаунта, но поспешность без планирования создает "узкие места".

> #### ⚠️ Важная информация
> 
> **Никогда не начинайте улучшение, не проверив сначала предварительные требования.** Вы же не хотите потратить 2 дня на накопление ресурсов, чтобы потом понять, что забыли повысить уровень Лаборатории или Полигона.

Прогресс меняется примерно на 20-м уровне. До 20-го уровня всё просто. После 20-го уровня вы должны уделить приоритетное внимание списку "Требуемых зданий", так как они станут основными пожирателями вашего времени.

=== pane--ru--strategy--sanctuary--02--prereqs ===
---
title: "Таблица требований уровня"
nav_id: "prereqs"
parent_guide: "sanctuary"
lang: "ru"
order: 2
---

Используйте таблицу ниже, чтобы спланировать свою очередь строительства. Она охватывает затраты ресурсов и конкретные требования к строениям, чтобы избежать остановок строительства.

<img src="/images/guides/sanctuary-prereqs.jpg" alt="Требования к уровню Святилища" class="blueprint-img" onclick="document.getElementById('sanctuary-prereqsZoom').showModal()" style="cursor: pointer;">

=== pane--ru--strategy--sanctuary--03--goals ===
---
title: "Целевые уровни зданий"
nav_id: "goals"
parent_guide: "sanctuary"
lang: "ru"
order: 3
---

Как только вы достигнете этих уровней, вы выполните все предварительные требования для Святилища 30-го уровня. Вы можете понизить приоритет этих зданий и перераспределить ресурсы на войска и технологии.

{% include sanctuary_goals.html lang=page.lang %}

=== pane--ru--strategy--sanctuary--04--efficiency ===
---
title: "Эффективность и ресурсы"
nav_id: "tips"
parent_guide: "sanctuary"
lang: "ru"
order: 4
---

Переход с 25-го на 30-й уровень — самый крутой подъем в игре. Чтобы сохранить темп:

* **Скорость строительства:** Убедитесь, что ваше исследование "Скорость строительства" максимально прокачано в Лаборатории. Это дает накопительный бонус, который экономит недели времени к 30-му уровню.
* **Совмещение:** По возможности совмещайте крупные улучшения зданий с событием "Дуэль Альянсов", чтобы получать очки за свои усилия.
* **Титулы:** Обязательно используйте Министра строительства или Главу по делам перед началом строительства. Эти баффы могут значительно сократить время строительства.

=== guide--tr--strategy--sanctuary ===
---
layout: guides
title: "Sığınak Rehberi"
subtitle: "Seviye Atlama Rehberi"
active_nav: guides
guide_id: "sanctuary"
nav_links:
  - name_key: "sanctuary_strategy"
    url: "#strategy"
  - name_key: "sanctuary_chart"
    url: "#prereqs"
  - name_key: "sanctuary_goals"
    url: "#goals"
  - name_key: "sanctuary_efficiency"
    url: "#tips"
dialogs:
  - dialogs/guides/strategy/sanctuary.html
---

{% for pane in site.guide_panes %}
  {% if pane.path contains 'sanctuary/' and pane.lang == page.lang %}
    <section class="content-pane" id="{{ pane.nav_id }}">
      {{ pane.content }}
    </section>
  {% endif %}
{% endfor %}

=== pane--tr--strategy--sanctuary--01--strategy ===
---
title: "İlerleme Stratejisi"
nav_id: "strategy"
parent_guide: "sanctuary"
lang: "tr"
order: 1
---

Sığınak 30. Seviye için yarışmak uzun vadeli hesap gücü için birincil hedeftir, ancak plan yapmadan acele etmek "tıkanıklıklara" neden olur.

> #### ⚠️ Öncelikli Bilgi
> 
> **Önkoşullarınızı kontrol etmeden asla bir yükseltme başlatmayın.** Laboratuvarı veya Eğitim Sahasını geliştirmeyi unuttuğunuzu fark etmek için 2 gününüzü kaynak biriktirerek harcamak istemezsiniz.

İlerleme 20. Seviye civarında değişir. 20'den önce ilerleme basittir. 20'den sonra, "Gerekli Binalar" listesine öncelik vermelisiniz, çünkü bunlar birincil zaman kaybettiren unsurlarınız haline gelecektir.

=== pane--tr--strategy--sanctuary--02--prereqs ===
---
title: "Seviye Önkoşulları Tablosu"
nav_id: "prereqs"
parent_guide: "sanctuary"
lang: "tr"
order: 2
---

İnşaat kuyruğunuzu planlamak için aşağıdaki tabloyu kullanın. Bu, inşaat durmalarını önlemek için kaynak maliyetlerini ve belirli yapı gereksinimlerini kapsar.

<img src="/images/guides/sanctuary-prereqs.jpg" alt="Sığınak Seviyesi Önkoşulları" class="blueprint-img" onclick="document.getElementById('sanctuary-prereqsZoom').showModal()" style="cursor: pointer;">

=== pane--tr--strategy--sanctuary--03--goals ===
---
title: "Bina Hedef Seviyeleri"
nav_id: "goals"
parent_guide: "sanctuary"
lang: "tr"
order: 3
---

Bu seviyelere ulaştığınızda, Sığınak 30 için tüm önkoşul gereksinimlerini karşılamış olursunuz. Bu binalara öncelik vermeyi bırakabilir ve kaynaklarınızı birliklere ve teknolojiye yeniden tahsis edebilirsiniz.

{% include sanctuary_goals.html lang=page.lang %}

=== pane--tr--strategy--sanctuary--04--efficiency ===
---
title: "Verimlilik ve Harcama"
nav_id: "tips"
parent_guide: "sanctuary"
lang: "tr"
order: 4
---

25. seviyeden 30'a geçiş, oyundaki en dik tırmanışı temsil eder. Hızı korumak için:

* **İnşaat Hızı:** Laboratuvardaki "İnşaat Hızı" araştırmanızın en üst düzeye çıkarıldığından emin olun. Bu, 30. seviyeye kadar haftalarca zaman kazandıran birleşik bir bonus sağlar.
* **Hizalama:** Çabalarınız için puan kazanmak amacıyla büyük bina yükseltmelerinizi mümkün olduğunca "İttifak Düellosu" etkinliğiyle hizalayın.
* **Unvanlar:** İnşaata başlamadan önce İnşaat Bakanı veya İşler Şefi'ni kullandığınızdan emin olun. Bu güçlendirmeler inşaat sürelerini önemli ölçüde azaltabilir.

=== guide--uk--strategy--sanctuary ===
---
layout: guides
title: "Гайд по Святилищу"
subtitle: "Посібник з прокачування"
active_nav: guides
guide_id: "sanctuary"
nav_links:
  - name_key: "sanctuary_strategy"
    url: "#strategy"
  - name_key: "sanctuary_chart"
    url: "#prereqs"
  - name_key: "sanctuary_goals"
    url: "#goals"
  - name_key: "sanctuary_efficiency"
    url: "#tips"
dialogs:
  - dialogs/guides/strategy/sanctuary.html
---

{% for pane in site.guide_panes %}
  {% if pane.path contains 'sanctuary/' and pane.lang == page.lang %}
    <section class="content-pane" id="{{ pane.nav_id }}">
      {{ pane.content }}
    </section>
  {% endif %}
{% endfor %}

=== pane--uk--strategy--sanctuary--01--strategy ===
---
title: "Стратегія прогресу"
nav_id: "strategy"
parent_guide: "sanctuary"
lang: "uk"
order: 1
---

Гонка до Святилища 30-го рівня — головна мета для довгострокової сили акаунта, але поспіх без планування створює "вузькі місця".

> #### ⚠️ Важлива інформація
> 
> **Ніколи не починайте покращення, не перевіривши спочатку попередні вимоги.** Ви ж не хочете витратити 2 дні на накопичення ресурсів, щоб потім зрозуміти, що забули підвищити рівень Лабораторії або Тренувального майданчика.

Прогрес змінюється приблизно на 20-му рівні. До 20-го рівня все просто. Після 20-го рівня ви повинні надати пріоритет списку "Необхідних будівель", оскільки вони стануть основними пожирачами вашого часу.

=== pane--uk--strategy--sanctuary--02--prereqs ===
---
title: "Таблиця вимог рівня"
nav_id: "prereqs"
parent_guide: "sanctuary"
lang: "uk"
order: 2
---

Використовуйте таблицю нижче, щоб спланувати свою чергу будівництва. Вона охоплює витрати ресурсів та конкретні вимоги до споруд, щоб уникнути зупинок будівництва.

<img src="/images/guides/sanctuary-prereqs.jpg" alt="Вимоги до рівня Святилища" class="blueprint-img" onclick="document.getElementById('sanctuary-prereqsZoom').showModal()" style="cursor: pointer;">

=== pane--uk--strategy--sanctuary--03--goals ===
---
title: "Цілі рівня будівель"
nav_id: "goals"
parent_guide: "sanctuary"
lang: "uk"
order: 3
---

Як тільки ви досягнете цих рівнів, ви виконаєте всі попередні вимоги для Святилища 30-го рівня. Ви можете знизити пріоритет цих будівель і перерозподілити ресурси на війська та технології.

{% include sanctuary_goals.html lang=page.lang %}

=== pane--uk--strategy--sanctuary--04--efficiency ===
---
title: "Ефективність та витрати"
nav_id: "tips"
parent_guide: "sanctuary"
lang: "uk"
order: 4
---

Перехід з 25-го на 30-й рівень — найкрутіший підйом у грі. Щоб зберегти темп:

* **Швидкість будівництва:** Переконайтеся, що ваше дослідження "Швидкість будівництва" максимально прокачане в Лабораторії. Це дає накопичувальний бонус, який економить тижні часу до 30-го рівня.
* **Суміщення:** За можливості суміщайте великі покращення будівель із подією "Дуель Альянсів", щоб отримувати очки за свої зусилля.
* **Титули:** Обов'язково використовуйте Міністра будівництва або Голову у справах перед початком будівництва. Ці баффи можуть значно скоротити час будівництва.
