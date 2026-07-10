=== guide--en--shops--sanctuary_shop ===
---
layout: guides
title: "Sanctuary Shop"
subtitle: "Sanctuary Shop"
active_nav: guides
guide_id: "sanctuary_shop"
nav_links:
  - name_key: "sanctuary_shop_explanation"
    url: "#explanation"
  - name_key: "sanctuary_shop_priority"
    url: "#priority"
  - name_key: "sanctuary_shop_extra"
    url: "#extra"
dialogs:
  - dialogs/guides/shops/sanctuary_shop.html
---

{% for pane in site.guide_panes %}
{% if pane.path contains 'sancshop/' and pane.lang == page.lang %}
<section class="content-pane" id="{{ pane.nav_id }}">
{{ pane.content }}
</section>
{% endif %}
{% endfor %}

=== pane--en--shops--sanctuary_shop--01--explanation ===
---
title: "Explanation"
nav_id: "explanation"
parent_guide: "sanctuary_shop"
lang: "en"
order: 1 
---
<div class="img-grid">
<div>
Through construction you can level up your Sanctuary which unlocks room upgrades inside. Copper Coins are earned idly and should be collected every 8 hours. They can be used at the Sanctuary Shop.
</div>
<div>
<img src="/images/guides/sanctuary-shop2.png" class="blueprint-img">
</div>
</div>

=== pane--en--shops--sanctuary_shop--02--priority ===
---
title: "Priority Purchases"
nav_id: "priority"
parent_guide: "sanctuary_shop"
lang: "en"
order: 2
---
<div class="img-grid">
<div>
<div markdown="1">
Here are the calculated item purchase priorities to clear out the shop efficiently to maximize your progression.
> #### ⚠️ Strategic Buy
> Focus your coins on highly constrained evolution assets first before picking up standard recruitment tickets.
</div>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Item</th>
      <th>Used</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>1</td>
      <td>Raven Essence</td>
      <td>Monday / Day 1</td>
    </tr>
    <tr>
      <td>2</td>
      <td>UR Hero Omni Shard</td>
      <td>Thursday / Day 4</td>
    </tr>
    <tr>
      <td>3</td>
      <td>SSR Hero Omni Shard</td>
      <td>Thursday / Day 4</td>
    </tr>
    <tr>
      <td>4</td>
      <td>Gearstone</td>
      <td>N/A</td>
    </tr>
    <tr>
      <td>5</td>
      <td>Survivor Recruitment Ticket</td>
      <td>Tuesday / Day 2</td>
    </tr>
    <tr>
      <td>6</td>
      <td>Skill Badge</td>
      <td>Thursday / Day 4</td>
    </tr>
  </tbody>
</table>
</div>
<div>
<img src="/images/guides/sanctuary-shop.png" alt="Sanctuary Shop" class="blueprint-img" onclick="document.getElementById('sanctuary-shopZoom').showModal()" style="cursor: pointer;">
</div>
</div>

=== pane--en--shops--sanctuary_shop--03--extra ===
---
title: "Extra bonuses"
nav_id: "extra"
parent_guide: "sanctuary_shop"
lang: "en"
order: 3
---

Do not forget to claim tips from the chest to the right of the reception desk, and survivors from the stand to the left of the reception desk.

>#### ⚠️ Note
>
> Walking around the sanctuary seems to provide small amounts of training speed ups, Raven Fruit, and Gearstone.

=== guide--de--shops--sanctuary_shop ===
---
layout: guides
title: "Zuflucht-Shop"
subtitle: "Zuflucht-Shop"
active_nav: guides
guide_id: "sanctuary_shop"
nav_links:
  - name_key: "sanctuary_shop_explanation"
    url: "#explanation"
  - name_key: "sanctuary_shop_priority"
    url: "#priority"
  - name_key: "sanctuary_shop_extra"
    url: "#extra"
dialogs:
  - dialogs/guides/shops/sanctuary_shop.html
---

{% for pane in site.guide_panes %}
{% if pane.path contains 'sancshop/' and pane.lang == page.lang %}
<section class="content-pane" id="{{ pane.nav_id }}">
{{ pane.content }}
</section>
{% endif %}
{% endfor %}

=== pane--de--shops--sanctuary_shop--01--explanation ===
---
title: "Erklärung"
nav_id: "explanation"
parent_guide: "sanctuary_shop"
lang: "de"
order: 1 
---
<div class="img-grid">
<div>
Durch das Bauen kannst du deine Zuflucht aufleveln, wodurch Raum-Upgrades im Inneren freigeschaltet werden. Kupfermünzen werden passiv generiert und sollten alle 8 Stunden eingesammelt werden. Sie können im Zuflucht-Shop ausgegeben werden.
</div>
<div>
<img src="/images/guides/sanctuary-shop2.png" class="blueprint-img">
</div>
</div>

=== pane--de--shops--sanctuary_shop--02--priority ===
---
title: "Priorität beim Kauf"
nav_id: "priority"
parent_guide: "sanctuary_shop"
lang: "de"
order: 2
---
<div class="img-grid">
<div>
<div markdown="1">
Hier sind die berechneten Prioritäten für den Kauf von Gegenständen, um den Shop effizient zu leeren und deinen Fortschritt zu maximieren.
> #### ⚠️ Strategischer Kauf
> Konzentriere deine Münzen zuerst auf stark begrenzte Evolutionsmaterialien, bevor du Standard-Rekrutierungstickets kaufst.
</div>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Gegenstand</th>
      <th>Verwendung</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>1</td>
      <td>Raven-Essenz</td>
      <td>Montag / Tag 1</td>
    </tr>
    <tr>
      <td>2</td>
      <td>UR-Helden-Omni-Splitter</td>
      <td>Donnerstag / Tag 4</td>
    </tr>
    <tr>
      <td>3</td>
      <td>SSR-Helden-Omni-Splitter</td>
      <td>Donnerstag / Tag 4</td>
    </tr>
    <tr>
      <td>4</td>
      <td>Zahnradstein (Gearstone)</td>
      <td>N/A</td>
    </tr>
    <tr>
      <td>5</td>
      <td>Überlebenden-Rekrutierungsticket</td>
      <td>Dienstag / Tag 2</td>
    </tr>
    <tr>
      <td>6</td>
      <td>Fähigkeitsabzeichen</td>
      <td>Donnerstag / Tag 4</td>
    </tr>
  </tbody>
</table>
</div>
<div>
<img src="/images/guides/sanctuary-shop.png" alt="Sanctuary Shop" class="blueprint-img" onclick="document.getElementById('sanctuary-shopZoom').showModal()" style="cursor: pointer;">
</div>
</div>

=== pane--de--shops--sanctuary_shop--03--extra ===
---
title: "Extra-Boni"
nav_id: "extra"
parent_guide: "sanctuary_shop"
lang: "de"
order: 3
---

Vergiss nicht, das Trinkgeld aus der Kiste rechts vom Empfangstisch und die Überlebenden vom Stand links vom Empfangstisch abzuholen.

>#### ⚠️ Hinweis
>
> Das Umhergehen in der Zuflucht scheint kleine Mengen an Trainingsbeschleunigern, Raven-Früchten und Zahnradsteinen zu gewähren.

=== guide--es--shops--sanctuary_shop ===
---
layout: guides
title: "Tienda del Santuario"
subtitle: "Tienda del Santuario"
active_nav: guides
guide_id: "sanctuary_shop"
nav_links:
  - name_key: "sanctuary_shop_explanation"
    url: "#explanation"
  - name_key: "sanctuary_shop_priority"
    url: "#priority"
  - name_key: "sanctuary_shop_extra"
    url: "#extra"
dialogs:
  - dialogs/guides/shops/sanctuary_shop.html
---

{% for pane in site.guide_panes %}
{% if pane.path contains 'sancshop/' and pane.lang == page.lang %}
<section class="content-pane" id="{{ pane.nav_id }}">
{{ pane.content }}
</section>
{% endif %}
{% endfor %}

=== pane--es--shops--sanctuary_shop--01--explanation ===
---
title: "Explicación"
nav_id: "explanation"
parent_guide: "sanctuary_shop"
lang: "es"
order: 1 
---
<div class="img-grid">
<div>
A través de la construcción puedes subir de nivel tu Santuario, lo que desbloquea mejoras de habitaciones en su interior. Las monedas de cobre se ganan de forma pasiva y deben recogerse cada 8 horas. Se pueden usar en la Tienda del Santuario.
</div>
<div>
<img src="/images/guides/sanctuary-shop2.png" class="blueprint-img">
</div>
</div>

=== pane--es--shops--sanctuary_shop--02--priority ===
---
title: "Prioridad de Compra"
nav_id: "priority"
parent_guide: "sanctuary_shop"
lang: "es"
order: 2
---
<div class="img-grid">
<div>
<div markdown="1">
Aquí están las prioridades de compra calculadas para vaciar la tienda de manera eficiente y maximizar tu progresión.
> #### ⚠️ Compra Estratégica
> Enfoca tus monedas primero en materiales de evolución altamente escasos antes de adquirir tickets de reclutamiento estándar.
</div>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Artículo</th>
      <th>Uso</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>1</td>
      <td>Esencia de Raven</td>
      <td>Lunes / Día 1</td>
    </tr>
    <tr>
      <td>2</td>
      <td>Fragmento Omni de Héroe UR</td>
      <td>Jueves / Día 4</td>
    </tr>
    <tr>
      <td>3</td>
      <td>Fragmento Omni de Héroe SSR</td>
      <td>Jueves / Día 4</td>
    </tr>
    <tr>
      <td>4</td>
      <td>Piedra de engranaje (Gearstone)</td>
      <td>N/A</td>
    </tr>
    <tr>
      <td>5</td>
      <td>Ticket de reclutamiento de superviviente</td>
      <td>Martes / Día 2</td>
    </tr>
    <tr>
      <td>6</td>
      <td>Insignia de habilidad</td>
      <td>Jueves / Día 4</td>
    </tr>
  </tbody>
</table>
</div>
<div>
<img src="/images/guides/sanctuary-shop.png" alt="Sanctuary Shop" class="blueprint-img" onclick="document.getElementById('sanctuary-shopZoom').showModal()" style="cursor: pointer;">
</div>
</div>

=== pane--es--shops--sanctuary_shop--03--extra ===
---
title: "Bonificaciones Extra"
nav_id: "extra"
parent_guide: "sanctuary_shop"
lang: "es"
order: 3
---

No olvides reclamar las propinas del cofre a la derecha de la mesa de recepción, y a los supervivientes del puesto a la izquierda de la mesa de recepción.

>#### ⚠️ Nota
>
> Caminar por el santuario parece otorgar pequeñas cantidades de aceleradores de entrenamiento, Fruta de Raven y Piedras de engranaje (Gearstone).

=== guide--fr--shops--sanctuary_shop ===
---
layout: guides
title: "Boutique du Sanctuaire"
subtitle: "Boutique du Sanctuaire"
active_nav: guides
guide_id: "sanctuary_shop"
nav_links:
  - name_key: "sanctuary_shop_explanation"
    url: "#explanation"
  - name_key: "sanctuary_shop_priority"
    url: "#priority"
  - name_key: "sanctuary_shop_extra"
    url: "#extra"
dialogs:
  - dialogs/guides/shops/sanctuary_shop.html
---

{% for pane in site.guide_panes %}
{% if pane.path contains 'sancshop/' and pane.lang == page.lang %}
<section class="content-pane" id="{{ pane.nav_id }}">
{{ pane.content }}
</section>
{% endif %}
{% endfor %}

=== pane--fr--shops--sanctuary_shop--01--explanation ===
---
title: "Explication"
nav_id: "explanation"
parent_guide: "sanctuary_shop"
lang: "fr"
order: 1 
---
<div class="img-grid">
<div>
Grâce à la construction, vous pouvez améliorer votre Sanctuaire, ce qui débloque des améliorations de pièces à l'intérieur. Les pièces de cuivre sont générées passivement et doivent être récupérées toutes les 8 heures. Elles peuvent être utilisées dans la Boutique du Sanctuaire.
</div>
<div>
<img src="/images/guides/sanctuary-shop2.png" class="blueprint-img">
</div>
</div>

=== pane--fr--shops--sanctuary_shop--02--priority ===
---
title: "Priorités d'Achat"
nav_id: "priority"
parent_guide: "sanctuary_shop"
lang: "fr"
order: 2
---
<div class="img-grid">
<div>
<div markdown="1">
Voici les priorités d'achat calculées pour vider efficacement la boutique afin de maximiser votre progression.
> #### ⚠️ Achat Stratégique
> Concentrez vos pièces en priorité sur les matériaux d'évolution très limités avant de prendre des tickets de recrutement standard.
</div>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Objet</th>
      <th>Utilisation</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>1</td>
      <td>Essence de Raven</td>
      <td>Lundi / Jour 1</td>
    </tr>
    <tr>
      <td>2</td>
      <td>Fragment Omni de Héros UR</td>
      <td>Jeudi / Jour 4</td>
    </tr>
    <tr>
      <td>3</td>
      <td>Fragment Omni de Héros SSR</td>
      <td>Jeudi / Jour 4</td>
    </tr>
    <tr>
      <td>4</td>
      <td>Pierre d'engrenage (Gearstone)</td>
      <td>N/A</td>
    </tr>
    <tr>
      <td>5</td>
      <td>Ticket de recrutement de survivant</td>
      <td>Mardi / Jour 2</td>
    </tr>
    <tr>
      <td>6</td>
      <td>Insigne de compétence</td>
      <td>Jeudi / Jour 4</td>
    </tr>
  </tbody>
</table>
</div>
<div>
<img src="/images/guides/sanctuary-shop.png" alt="Sanctuary Shop" class="blueprint-img" onclick="document.getElementById('sanctuary-shopZoom').showModal()" style="cursor: pointer;">
</div>
</div>

=== pane--fr--shops--sanctuary_shop--03--extra ===
---
title: "Bonus Extra"
nav_id: "extra"
parent_guide: "sanctuary_shop"
lang: "fr"
order: 3
---

N'oubliez pas de récupérer les pourboires dans le coffre à droite du bureau de réception, et les survivants sur le présentoir à gauche du bureau de réception.

>#### ⚠️ Note
>
> Se promener dans le sanctuaire semble fournir de petites quantités d'accélérations d'entraînement, de Fruits de Raven et de Pierres d'engrenage (Gearstone).

=== guide--ru--shops--sanctuary_shop ===
---
layout: guides
title: "Магазин Убежища"
subtitle: "Магазин Убежища"
active_nav: guides
guide_id: "sanctuary_shop"
nav_links:
  - name_key: "sanctuary_shop_explanation"
    url: "#explanation"
  - name_key: "sanctuary_shop_priority"
    url: "#priority"
  - name_key: "sanctuary_shop_extra"
    url: "#extra"
dialogs:
  - dialogs/guides/shops/sanctuary_shop.html
---

{% for pane in site.guide_panes %}
{% if pane.path contains 'sancshop/' and pane.lang == page.lang %}
<section class="content-pane" id="{{ pane.nav_id }}">
{{ pane.content }}
</section>
{% endif %}
{% endfor %}

=== pane--ru--shops--sanctuary_shop--01--explanation ===
---
title: "Описание"
nav_id: "explanation"
parent_guide: "sanctuary_shop"
lang: "ru"
order: 1 
---
<div class="img-grid">
<div>
С помощью строительства вы можете повышать уровень своего Убежища, что открывает улучшения комнат внутри. Медные монеты накапливаются пассивно, их следует собирать каждые 8 часов. Их можно потратить в Магазине Убежища.
</div>
<div>
<img src="/images/guides/sanctuary-shop2.png" class="blueprint-img">
</div>
</div>

=== pane--ru--shops--sanctuary_shop--02--priority ===
---
title: "Приоритеты Покупок"
nav_id: "priority"
parent_guide: "sanctuary_shop"
lang: "ru"
order: 2
---
<div class="img-grid">
<div>
<div markdown="1">
Ниже приведены рассчитанные приоритеты покупки предметов, позволяющие эффективно опустошать магазин для максимального ускорения вашего прогресса.
> #### ⚠️ Стратегическая покупка
> Тратьте свои монеты в первую очередь на дефицитные материалы для эволюции, прежде чем приобретать стандартные билеты найма.
</div>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Предмет</th>
      <th>Применение</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>1</td>
      <td>Эссенция Рейвена</td>
      <td>Понедельник / День 1</td>
    </tr>
    <tr>
      <td>2</td>
      <td>Универсальный осколок героя UR</td>
      <td>Четверг / День 4</td>
    </tr>
    <tr>
      <td>3</td>
      <td>Универсальный осколок героя SSR</td>
      <td>Четверг / День 4</td>
    </tr>
    <tr>
      <td>4</td>
      <td>Шестеренчатый камень (Gearstone)</td>
      <td>Н/A</td>
    </tr>
    <tr>
      <td>5</td>
      <td>Билет найма выжившего</td>
      <td>Вторник / День 2</td>
    </tr>
    <tr>
      <td>6</td>
      <td>Значок навыка</td>
      <td>Четверг / День 4</td>
    </tr>
  </tbody>
</table>
</div>
<div>
<img src="/images/guides/sanctuary-shop.png" alt="Sanctuary Shop" class="blueprint-img" onclick="document.getElementById('sanctuary-shopZoom').showModal()" style="cursor: pointer;">
</div>
</div>

=== pane--ru--shops--sanctuary_shop--03--extra ===
---
title: "Дополнительные Бонусы"
nav_id: "extra"
parent_guide: "sanctuary_shop"
lang: "ru"
order: 3
---

Не забудьте забрать чаевые из сундука справа от стойки регистрации и выживших со стенда слева от стойки регистрации.

>#### ⚠️ Примечание
>
> Прогулки по убежищу, похоже, приносят небольшое количество ускорений тренировки, плодов Рейвена и шестеренчатых камней (Gearstone).

=== guide--tr--shops--sanctuary_shop ===
---
layout: guides
title: "Sığınak Mağazası"
subtitle: "Sığınak Mağazası"
active_nav: guides
guide_id: "sanctuary_shop"
nav_links:
  - name_key: "sanctuary_shop_explanation"
    url: "#explanation"
  - name_key: "sanctuary_shop_priority"
    url: "#priority"
  - name_key: "sanctuary_shop_extra"
    url: "#extra"
dialogs:
  - dialogs/guides/shops/sanctuary_shop.html
---

{% for pane in site.guide_panes %}
{% if pane.path contains 'sancshop/' and pane.lang == page.lang %}
<section class="content-pane" id="{{ pane.nav_id }}">
{{ pane.content }}
</section>
{% endif %}
{% endfor %}

=== pane--tr--shops--sanctuary_shop--01--explanation ===
---
title: "Açıklama"
nav_id: "explanation"
parent_guide: "sanctuary_shop"
lang: "tr"
order: 1 
---
<div class="img-grid">
<div>
İnşaat yaparak Sığınak seviyenizi yükseltebilir ve içerideki oda geliştirmelerinin kilidini açabilirsiniz. Bakır Sikkeler pasif olarak kazanılır ve her 8 saatte bir toplanmalıdır. Sığınak Mağazasında kullanılabilirler.
</div>
<div>
<img src="/images/guides/sanctuary-shop2.png" class="blueprint-img">
</div>
</div>

=== pane--tr--shops--sanctuary_shop--02--priority ===
---
title: "Satın Alma Önceliği"
nav_id: "priority"
parent_guide: "sanctuary_shop"
lang: "tr"
order: 2
---
<div class="img-grid">
<div>
<div markdown="1">
Gelişiminizi en üst düzeye çıkarmak amacıyla mağazayı verimli bir şekilde temizlemek için hesaplanan öğe satın alma öncelikleri aşağıdadır.
> #### ⚠️ Stratejik Satın Alma
> Standart arama biletlerini almadan önce sikkelerinizi ilk olarak son derece kısıtlı olan evrim materyallerine odaklayın.
</div>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Öğe</th>
      <th>Kullanım</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>1</td>
      <td>Raven Esansı</td>
      <td>Pazartesi / 1. Gün</td>
    </tr>
    <tr>
      <td>2</td>
      <td>UR Kahraman Omni Parçası</td>
      <td>Perşembe / 4. Gün</td>
    </tr>
    <tr>
      <td>3</td>
      <td>SSR Kahraman Omni Parçası</td>
      <td>Perşembe / 4. Gün</td>
    </tr>
    <tr>
      <td>4</td>
      <td>Dişli Taşı (Gearstone)</td>
      <td>N/A</td>
    </tr>
    <tr>
      <td>5</td>
      <td>Hayatta Kalan Arama Bileti</td>
      <td>Salı / 2. Gün</td>
    </tr>
    <tr>
      <td>6</td>
      <td>Yetenek Rozeti</td>
      <td>Perşembe / 4. Gün</td>
    </tr>
  </tbody>
</table>
</div>
<div>
<img src="/images/guides/sanctuary-shop.png" alt="Sanctuary Shop" class="blueprint-img" onclick="document.getElementById('sanctuary-shopZoom').showModal()" style="cursor: pointer;">
</div>
</div>

=== pane--tr--shops--sanctuary_shop--03--extra ===
---
title: "Ekstra Bonuslar"
nav_id: "extra"
parent_guide: "sanctuary_shop"
lang: "tr"
order: 3
---

Resepsiyon masasının sağındaki sandıktan bahşişleri ve resepsiyon masasının solundaki stanttan hayatta kalanları almayı unutmayın.

>#### ⚠️ Not
>
> Sığınakta dolaşmak küçük miktarlarda eğitim hızlandırması, Raven Meyvesi ve Dişli Taşı (Gearstone) sağlıyor gibi görünüyor.

=== guide--uk--shops--sanctuary_shop ===
---
layout: guides
title: "Магазин Сховища"
subtitle: "Магазин Сховища"
active_nav: guides
guide_id: "sanctuary_shop"
nav_links:
  - name_key: "sanctuary_shop_explanation"
    url: "#explanation"
  - name_key: "sanctuary_shop_priority"
    url: "#priority"
  - name_key: "sanctuary_shop_extra"
    url: "#extra"
dialogs:
  - dialogs/guides/shops/sanctuary_shop.html
---

{% for pane in site.guide_panes %}
{% if pane.path contains 'sancshop/' and pane.lang == page.lang %}
<section class="content-pane" id="{{ pane.nav_id }}">
{{ pane.content }}
</section>
{% endif %}
{% endfor %}

=== pane--uk--shops--sanctuary_shop--01--explanation ===
---
title: "Пояснення"
nav_id: "explanation"
parent_guide: "sanctuary_shop"
lang: "uk"
order: 1 
---
<div class="img-grid">
<div>
Завдяки будівництву ви можете підвищувати рівень свого Сховища, що відкриває покращення кімнат усередині. Мідні монети накопичуються пасивно, і їх слід збирати кожні 8 годин. Їх можна використовувати в Магазині Сховища.
</div>
<div>
<img src="/images/guides/sanctuary-shop2.png" class="blueprint-img">
</div>
</div>

=== pane--uk--shops--sanctuary_shop--02--priority ===
---
title: "Пріоритет Покупок"
nav_id: "priority"
parent_guide: "sanctuary_shop"
lang: "uk"
order: 2
---
<div class="img-grid">
<div>
<div markdown="1">
Ось розраховані пріоритети купівлі предметів, які допоможуть ефективно очистити магазин для максимального прискорення вашого прогресу.
> #### ⚠️ Стратегічна Покупка
> Спрямовуйте свої монети в першу чергу на сильно дефіцитні матеріали для еволюції, перш ніж купувати стандартні квитки найму.
</div>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Предмет</th>
      <th>Використання</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>1</td>
      <td>Есенція Рейвена</td>
      <td>Понеділок / День 1</td>
    </tr>
    <tr>
      <td>2</td>
      <td>Універсальний осколок героя UR</td>
      <td>Четверг / День 4</td>
    </tr>
    <tr>
      <td>3</td>
      <td>Универсальний осколок героя SSR</td>
      <td>Четверг / День 4</td>
    </tr>
    <tr>
      <td>4</td>
      <td>Камінь спорядження (Gearstone)</td>
      <td>Н/A</td>
    </tr>
    <tr>
      <td>5</td>
      <td>Квиток найму вижилого</td>
      <td>Вівторок / День 2</td>
    </tr>
    <tr>
      <td>6</td>
      <td>Значок навички</td>
      <td>Четверг / День 4</td>
    </tr>
  </tbody>
</table>
</div>
<div>
<img src="/images/guides/sanctuary-shop.png" alt="Sanctuary Shop" class="blueprint-img" onclick="document.getElementById('sanctuary-shopZoom').showModal()" style="cursor: pointer;">
</div>
</div>

=== pane--uk--shops--sanctuary_shop--03--extra ===
---
title: "Додаткові Бонуси"
nav_id: "extra"
parent_guide: "sanctuary_shop"
lang: "uk"
order: 3
---

Не забудьте забрати чайові зі скрині праворуч від стійки реєстрації та вижилих зі стенду ліворуч від стійки реєстрації.

>#### ⚠️ Примітка
>
> Прогулянки сховищем, схоже, дають невелику кількість прискорювачів тренування, плодів Рейвена та каменів спорядження (Gearstone).

=== guide--it--shops--sanctuary_shop ===
---
layout: guides
title: "Negozio del Santuario"
subtitle: "Negozio del Santuario"
active_nav: guides
guide_id: "sanctuary_shop"
nav_links:
  - name_key: "sanctuary_shop_explanation"
    url: "#explanation"
  - name_key: "sanctuary_shop_priority"
    url: "#priority"
  - name_key: "sanctuary_shop_extra"
    url: "#extra"
dialogs:
  - dialogs/guides/shops/sanctuary_shop.html
---

{% for pane in site.guide_panes %}
{% if pane.path contains 'sancshop/' and pane.lang == page.lang %}
<section class="content-pane" id="{{ pane.nav_id }}">
{{ pane.content }}
</section>
{% endif %}
{% endfor %}

=== pane--it--shops--sanctuary_shop--01--explanation ===
---
title: "Spiegazione"
nav_id: "explanation"
parent_guide: "sanctuary_shop"
lang: "it"
order: 1 
---
<div class="img-grid">
<div>
Attraverso la costruzione puoi far salire di livello il tuo Santuario, sbloccando i potenziamenti delle stanze al suo interno. Le monete di rame si guadagnano passivamente e dovrebbero essere raccolte ogni 8 ore. Possono essere utilizzate nel Negozio del Santuario.
</div>
<div>
<img src="/images/guides/sanctuary-shop2.png" class="blueprint-img">
</div>
</div>

=== pane--it--shops--sanctuary_shop--02--priority ===
---
title: "Priorità di Acquisto"
nav_id: "priority"
parent_guide: "sanctuary_shop"
lang: "it"
order: 2
---
<div class="img-grid">
<div>
<div markdown="1">
Di seguito sono elencate le priorità di acquisto calcolate per svuotare il negozio in modo efficiente e massimizzare la tua progressione.
> #### ⚠️ Acquisto Strategico
> Concentra le tue monete prima sui materiali di evoluzione altamente limitati prima di raccogliere i biglietti di reclutamento standard.
</div>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Articolo</th>
      <th>Utilizzo</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>1</td>
      <td>Essenza di Raven</td>
      <td>Lunedì / Giorno 1</td>
    </tr>
    <tr>
      <td>2</td>
      <td>Frammento Omni Eroe UR</td>
      <td>Giovedì / Giorno 4</td>
    </tr>
    <tr>
      <td>3</td>
      <td>Frammento Omni Eroe SSR</td>
      <td>Giovedì / Giorno 4</td>
    </tr>
    <tr>
      <td>4</td>
      <td>Pietra ingranaggio (Gearstone)</td>
      <td>N/A</td>
    </tr>
    <tr>
      <td>5</td>
      <td>Biglietto di reclutamento superstite</td>
      <td>Martedì / Giorno 2</td>
    </tr>
    <tr>
      <td>6</td>
      <td>Distintivo abilità</td>
      <td>Giovedì / Giorno 4</td>
    </tr>
  </tbody>
</table>
</div>
<div>
<img src="/images/guides/sanctuary-shop.png" alt="Sanctuary Shop" class="blueprint-img" onclick="document.getElementById('sanctuary-shopZoom').showModal()" style="cursor: pointer;">
</div>
</div>

=== pane--it--shops--sanctuary_shop--03--extra ===
---
title: "Bonus Extra"
nav_id: "extra"
parent_guide: "sanctuary_shop"
lang: "it"
order: 3
---

Non dimenticare di riscuotere le mance dalla cassa a destra del banco della reception e i superstiti dal chiosco a sinistra del banco della reception.

>#### ⚠️ Nota
>
> Camminare per il santuario sembra fornire piccole quantità di acceleratori di addestramento, Frutti di Raven e Pietre ingranaggio (Gearstone).