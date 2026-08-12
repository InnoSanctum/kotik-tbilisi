/*
 * Static seed / offline fallback.
 *
 * This file is the single source of truth when config.js has no Supabase
 * project, and the safety net when it has one but the network is down. It is
 * also what supabase/schema.sql seeds the database from, so the shapes here and
 * the `pets` table columns are deliberately identical.
 *
 * A plain <script> tag, not JSON + fetch, on purpose: browsers refuse to fetch
 * local files, so with a .json file the site would be blank when index.html is
 * opened by double-clicking it. This works from disk and over http alike.
 *
 * Every human-readable field is a {lang: text} map. Russian is what the cards
 * are written in; anything missing falls back to it (see assets/i18n.js).
 * Adding a language means adding a key — no schema change, no code change.
 */
/*
 * Shared records: tags, curators and donation links.
 *
 * These are referenced by pets rather than copied into them, exactly as in the
 * database (see supabase/schema.sql). One curator looks after several animals,
 * and a tag only groups animals if everyone spells it the same way — so the
 * text lives in one place and every pet points at it.
 *
 * The admin offers everything here as autocomplete suggestions.
 */
window.TAGS_SEED = [
  { id: 'cat',        ru: 'Кот',                     en: 'Cat',                 ka: 'კატა' },
  { id: 'dog',        ru: 'Собака',                  en: 'Dog',                 ka: 'ძაღლი' },
  { id: 'young',      ru: 'Молодой (~3 года)',       en: 'Young (~3 years)',    ka: 'ახალგაზრდა (~3 წლის)' },
  { id: 'calm',       ru: 'Спокойный & независимый', en: 'Calm & independent',  ka: 'მშვიდი & დამოუკიდებელი' },
  { id: 'fiv',        ru: 'ВИК (FIV) +',             en: 'FIV positive +',      ka: 'FIV (ვიკ) დადებითი +' },
  { id: 'tbilisi',    ru: 'Тбилиси',                 en: 'Tbilisi',             ka: 'თბილისი' },
  { id: 'needs-home', ru: 'Ищет дом',                en: 'Needs a home',        ka: 'ეძებს სახლს' },
  { id: 'vaccinated', ru: 'Привит',                  en: 'Vaccinated',          ka: 'აცრილი' },
  { id: 'sterilised', ru: 'Стерилизован',            en: 'Sterilised',          ka: 'სტერილიზებული' }
];

window.CURATORS_SEED = [
  {
    slug: 'mykhailo',
    name: { ru: 'Михаил (Михайло)', en: 'Mykhailo (Mikhail)', ka: 'მიხაილო' },
    photo: 'assets/author.webp',
    photoAlt: {
      ru: 'Михайло, автор страницы',
      en: 'Mykhailo, the author of this page',
      ka: 'მიხაილო, გვერდის ავტორი'
    },
    bio: {
      ru: 'Работаю в айти на низовой должности. Сам из Украины, живу в Грузии. Играю на гитаре, пою в хоре и очень люблю котиков.',
      en: 'I work an entry-level job in IT. I’m from Ukraine and I live in Georgia. I play guitar, sing in a choir, and I love cats.',
      ka: 'ვმუშაობ IT-ში დაბალ თანამდებობაზე. წარმოშობით უკრაინიდან ვარ, ვცხოვრობ საქართველოში. ვუკრავ გიტარაზე, ვმღერი გუნდში და ძალიან მიყვარს კატები.'
    },
    email: 'innosanctum@gmail.com',
    telegram: 'https://t.me/innosanctum',
    instagram: 'https://www.instagram.com/mserhiievskyi/'
  }
];

window.DONATIONS_SEED = [
  {
    slug: 'kotik-bog',
    url: 'https://egreve.bog.ge/For_Kotik',
    /* The bank's own QR image, kept rather than generated: a bank code can
       carry a payment payload that a plain URL cannot. Clear this and the site
       draws one from `url` in the browser instead — which is what happens for
       any new link, so a QR is never missing. */
    qr: 'assets/qr_code.png',
    label: {
      ru: 'Перевести в Bank of Georgia',
      en: 'Donate via Bank of Georgia',
      ka: 'გადარიცხვა Bank of Georgia-ში'
    },
    note: {
      ru: 'Любая сумма поможет оплатить предстоящую чистку зубов под седацией, УЗИ и необходимые медикаменты.',
      en: 'Any amount helps cover the upcoming dental cleaning under sedation, the ultrasound, and medication.',
      ka: 'ნებისმიერი თანხა დაგვეხმარება სტომატოლოგიური პროცედურის, ექოსკოპიისა და მედიკამენტების დაფინანსებაში.'
    }
  }
];

window.PETS_SEED = [
  {
    slug: 'kotik',
    published: true,
    sortOrder: 1,

    name: {
      ru: 'Котик',
      en: 'Kotik',
      ka: 'კოტიკი'
    },
    subtitle: {
      ru: 'Дворовой кот из Тбилиси',
      en: 'Street cat from Tbilisi',
      ka: 'ქუჩის კატა თბილისიდან'
    },
    location: {
      ru: 'Тбилиси',
      en: 'Tbilisi',
      ka: 'თბილისი'
    },
    status: {
      ru: 'Нужна помощь',
      en: 'Help needed',
      ka: 'საჭიროებს დახმარებას'
    },
    statusType: 'warning',

    /* Tag ids only — the labels live once in TAGS_SEED above, so renaming a
       tag renames it on every animal at the same time. */
    tags: ['cat', 'young', 'calm', 'fiv', 'tbilisi', 'needs-home'],

    mainPhoto: {
      src: 'media/kotik-2026-03-12.webp',
      thumb: 'media/thumbs/kotik-2026-03-12.webp',
      alt: {
        ru: 'Котик спит, свернувшись клубком, на пледе',
        en: 'Kotik curled up asleep on a blanket',
        ka: 'კოტიკს გორგალივით დახვეულს სძინავს საბანზე'
      }
    },

    shortDescription: {
      ru: 'Молодой дворовой кот из итальянского дворика. У него выявили ВИК и воспаление; нужны чистка зубов под седацией, УЗИ и дом, где он не будет контактировать с другими кошками.',
      en: 'A young street cat from an Italian courtyard. Diagnosed with FIV and inflammation; he needs dental work under sedation, an ultrasound, and a home away from other cats.',
      ka: 'ახალგაზრდა ქუჩის კატა იტალიური ეზოდან. აღმოაჩნდა FIV და ანთება; სჭირდება კბილების მკურნალობა სედაციის ქვეშ, ექოსკოპია და სახლი სხვა კატებისგან მოშორებით.'
    },

    /* Blank line = paragraph break when rendered. */
    description: {
      ru: 'Котик — молодой, сдержанный и очень независимый дворовой кот, живущий в обычном итальянском дворике в Тбилиси. Так сложилось, что я живу в том же итальянском дворике и кормлю местных кошек, и Котик начал приходить ко мне — не сразу, но, видимо, взяв пример со своих пушистых собратьев, он решил, что я не так уж страшен. Зимой он грелся на диване по ночам, весной перестал гостить, но каждый день приходил за едой и общением.\n\nНе так давно я заметил, что с ним что-то не так. Сильный неприятный запах изо рта, вялость — он мог несколько часов просидеть на одном месте, не двигаясь, затем отойти за едой на несколько минут — и опять вернуться на свой пост, на следующие несколько часов. Шерсть стала тусклая, походка неуверенная. Он чесался, не набирал вес, хотя ел с избытком, постоянно много пил.\n\nМы с женой не могли на это спокойно смотреть, и отнесли его к ветеринару. Как выяснилось, не зря: во время осмотра был выявлен ВИК (вирус иммунодефицита кошек), а также его постоянный спутник — воспалительный процесс. ВИК не лечится, но воспаление можно снять. Кроме того, нужны дополнительные исследования, которые могут показать другие заболевания. И кота нужно как-то изолировать от других кошек — так что было бы неплохо найти для него дом: я снимаю квартиру, и котов держать мне нельзя. Да и квартира очень маленькая, а Котик привык к жизни во дворе и дома сидеть отказывается.\n\nМы оплатили первичный осмотр, анализы, обработку от паразитов и базовые лекарства. Однако Котику всё ещё требуется чистка зубов под седацией, УЗИ брюшной полости и дальнейший уход. На это у меня, к сожалению, нет средств, и я прошу помощи у неравнодушных людей.',

      en: 'Kotik is a young, reserved, and very independent street cat living in a typical Italian courtyard in Tbilisi. It so happened that I live in the same courtyard and feed the local cats, so Kotik started coming to me — not right away, but apparently taking a cue from his furry brethren, he decided I wasn’t so scary after all. In the winter he warmed himself on the couch at night; in the spring he stopped visiting, but came every day for food and companionship.\n\nNot long ago I noticed something was wrong with him. A strong, unpleasant odour on his breath, and lethargy — he would sit in one place for several hours without moving, then go off for food for a few minutes, and return to his post for the next several hours. His fur became dull and his gait unsteady. He scratched himself and wasn’t gaining weight, despite eating abundantly and constantly drinking a lot.\n\nMy wife and I couldn’t stand it and took him to the vet. As it turned out, it was worth it: the examination revealed FIV (feline immunodeficiency virus) along with its constant companion — an inflammatory process. FIV is incurable, but the inflammation can be reduced. Additional tests are also needed, which could reveal other conditions. And he needs to be kept away from other cats, so it would be good to find him a home: I rent an apartment and am not allowed to keep cats. The apartment is very small too, and Kotik is used to life in the courtyard and refuses to stay indoors.\n\nWe paid for the initial examination, tests, parasite treatment, and basic medications. However, Kotik still needs a teeth cleaning under sedation, an abdominal ultrasound, and ongoing care. Unfortunately I don’t have the funds for this, and I’m asking for help from caring people.',

      ka: 'კოტიკი ახალგაზრდა, თავშეკავებული და ძალიან დამოუკიდებელი ქუჩის კატაა, რომელიც თბილისურ ტიპურ იტალიურ ეზოში ცხოვრობს. შემთხვევით მეც იმავე იტალიურ ეზოში ვცხოვრობ და ადგილობრივ კატებს ვკვებავ, ამიტომ კოტიკმა ჩემთან მოსვლა დაიწყო — არა მაშინვე, მაგრამ, როგორც ჩანს, თავისი ბეწვიანი ძმებისგან მაგალითს იღებდა და გადაწყვიტა, რომ ბოლოს და ბოლოს, არც ისე საშინელი ვიყავი. ზამთარში ღამით დივანზე თბებოდა; გაზაფხულზე კი აღარ სტუმრობდა, მაგრამ ყოველდღე მოდიოდა საჭმლისა და ურთიერთობისთვის.\n\nარც ისე დიდი ხნის წინ შევნიშნე, რომ რაღაც სჭირდა. სუნთქვაში ძლიერი, უსიამოვნო სუნი ჰქონდა და ლეთარგიული იყო — რამდენიმე საათის განმავლობაში ერთ ადგილას იჯდა უმოძრაოდ, შემდეგ რამდენიმე წუთით საჭმელად მიდიოდა და შემდეგ რამდენიმე საათის განმავლობაში თავის ადგილს უბრუნდებოდა. ბეწვი გაუფერულდა და სიარული არამყარი ჰქონდა. თავს იფხანდა და წონაში არ იმატებდა, მიუხედავად იმისა, რომ უხვად ჭამდა და მუდმივად ბევრს სვამდა.\n\nმე და ჩემმა მეუღლემ ვერ გავუძელით და ვეტერინართან წავიყვანეთ. როგორც აღმოჩნდა, ღირდა: გამოკვლევის დროს აღმოჩნდა კატის იმუნოდეფიციტის ვირუსი (FIV) და მისი მუდმივი თანმხლები — ანთებითი პროცესი. FIV განუკურნებელია, მაგრამ ანთების შემცირება შესაძლებელია. გარდა ამისა, საჭიროა დამატებითი ანალიზები, რომლებმაც შეიძლება სხვა დაავადებები გამოავლინოს. კატა ასევე საჭიროებს იზოლირებას სხვა კატებისგან, ამიტომ კარგი იქნებოდა მისთვის სახლის პოვნა: ბინას ვქირაობ და კატებს ვერ ვამყოფებ. ბინაც ძალიან პატარაა, კოტიკი კი მიჩვეულია ეზოში ცხოვრებას და უარს ამბობს სახლში დარჩენაზე.\n\nჩვენ დავფარეთ საწყისი გამოკვლევის, ანალიზების, პარაზიტების მკურნალობისა და ძირითადი მედიკამენტების ხარჯები. თუმცა, კოტიკს ჯერ კიდევ სჭირდება კბილების გაწმენდა სედაციის ქვეშ, მუცლის ღრუს ულტრაბგერითი გამოკვლევა და მუდმივი მოვლა. სამწუხაროდ, ამისთვის სახსრები არ მაქვს და დახმარებას მზრუნველი ადამიანებისგან ვითხოვ.'
    },

    /* Slots are unbounded; these seven are the real photos in media/. */
    gallery: [
      {
        type: 'image',
        src: 'media/kotik-2026-03-12.webp',
        thumb: 'media/thumbs/kotik-2026-03-12.webp',
        alt: {
          ru: 'Котик спит, свернувшись клубком, на пледе',
          en: 'Kotik curled up asleep on a blanket',
          ka: 'კოტიკს გორგალივით დახვეულს სძინავს საბანზე'
        }
      },
      {
        type: 'image',
        src: 'media/kotik-2025-09-08.webp',
        thumb: 'media/thumbs/kotik-2025-09-08.webp',
        alt: {
          ru: 'Котик сидит на деревянном полу и смотрит в сторону',
          en: 'Kotik sitting on a wooden floor, looking to one side',
          ka: 'კოტიკი ხის იატაკზე ზის და გვერდით იყურება'
        }
      },
      {
        type: 'image',
        src: 'media/kotik-2025-11-06.webp',
        thumb: 'media/thumbs/kotik-2025-11-06.webp',
        alt: {
          ru: 'Котик спит на кровати рядом с жёлтой подушкой',
          en: 'Kotik asleep on a bed next to a yellow pillow',
          ka: 'კოტიკს საწოლზე, ყვითელი ბალიშის გვერდით სძინავს'
        }
      },
      {
        type: 'image',
        src: 'media/kotik-2025-11-16.webp',
        thumb: 'media/thumbs/kotik-2025-11-16.webp',
        alt: {
          ru: 'Котик спит на диване, спрятав лапы',
          en: 'Kotik asleep on the sofa with his paws tucked in',
          ka: 'კოტიკს დივანზე სძინავს, თათებამოკეცილს'
        }
      },
      {
        type: 'image',
        src: 'media/kotik-2025-11-30.webp',
        thumb: 'media/thumbs/kotik-2025-11-30.webp',
        alt: {
          ru: 'Котик спит на спине, раскинувшись на пледе',
          en: 'Kotik sleeping on his back, stretched out on a blanket',
          ka: 'კოტიკს ზურგზე გაშოტილს სძინავს საბანზე'
        }
      },
      {
        type: 'image',
        src: 'media/kotik-2026-05-04.webp',
        thumb: 'media/thumbs/kotik-2026-05-04.webp',
        alt: {
          ru: 'Котика держат на руках, он мяукает',
          en: 'Kotik being held in someone’s arms, meowing',
          ka: 'კოტიკი ხელში უჭირავთ და კნავის'
        }
      },
      {
        type: 'image',
        src: 'media/kotik-2026-05-04a.webp',
        thumb: 'media/thumbs/kotik-2026-05-04a.webp',
        alt: {
          ru: 'Крупный план мордочки Котика',
          en: 'Close-up of Kotik’s face',
          ka: 'კოტიკის სახის ახლო ხედი'
        }
      }
    ],

    /* Video reel. Left empty until there is a real clip — an empty object hides
       the section rather than rendering a broken player. */
    video: null,

    carePlan: [
      {
        state: 'done',
        title: { ru: 'Анализы крови и осмотр', en: 'Blood tests & initial exam', ka: 'სისხლის ანალიზი და გასინჯვა' },
        desc:  { ru: 'Оплачено. Выявлен ВИК, воспаление (WBC 23.2).', en: 'Paid. Diagnosed with FIV & inflammation (WBC 23.2).', ka: 'გადახდილია. გამოვლინდა FIV და ანთება (WBC 23.2).' }
      },
      {
        state: 'done',
        title: { ru: 'Обработка от паразитов и препараты', en: 'Parasite treatment & medications', ka: 'პარაზიტებისგან დამუშავება და მედიკამენტები' },
        desc:  { ru: 'Нексгард комбо, курс Доксициклина и Триттико.', en: 'NexGard Combo, a course of Doxycycline, and Trittico.', ka: 'NexGard Combo, დოქსიციკლინი და ტრიტიკო.' }
      },
      {
        state: 'needed',
        title: { ru: 'Санация ротовой полости', en: 'Dental sanitation', ka: 'პირის ღრუს სანიტაცია' },
        desc:  { ru: 'Чистка зубов и обработка дёсен под седацией в ветеринарной клинике.', en: 'Tooth cleaning and gum treatment under sedation at the vet clinic.', ka: 'კბილების გაწმენდა და ღრძილების დამუშავება სედაციის ქვეშ ვეტერინარულ კლინიკაში.' }
      },
      {
        state: 'needed',
        title: { ru: 'УЗИ брюшной полости', en: 'Abdominal ultrasound', ka: 'მუცლის ღრუს ულტრაბგერა (ექოსკოპია)' },
        desc:  { ru: 'Рекомендовано в клинике «Киви» (д-р Болюх / Михайлова).', en: 'Recommended at Kiwi Clinic (Dr. Bolyukh / Mykhailova).', ka: 'რეკომენდებულია კლინიკა «კივი»-ში (დრ. ბოლიუხი / მიხაილოვა).' }
      }
    ],

    docs: [
      {
        href: 'assets/blood_test.png',
        label: { ru: 'Анализ крови (27.06)', en: 'Blood test (27.06)', ka: 'სისხლის ანალიზი (27.06)' },
        sub:   { ru: 'Клиника ZooFamily', en: 'ZooFamily Clinic', ka: 'კლინიკა ZooFamily' }
      },
      {
        href: 'assets/vet_recommendation.png',
        label: { ru: 'Назначения врача', en: 'Vet prescriptions', ka: 'ექიმის დანიშნულება' },
        sub:   { ru: 'Рекомендации', en: 'Recommendations', ka: 'რეკომენდაციები' }
      }
    ],

    /* References into DONATIONS_SEED and CURATORS_SEED above. */
    donationSlug: 'kotik-bog',
    curatorSlug: 'mykhailo',

    /* Free-form blocks appended under the story.
       The charity-gig text used to live here, but it describes the project
       rather than this one cat — it now sits on the main page (SITE_CONTENT
       .gigs below) so it covers every animal. */
    sections: []
  }
];

/*
 * Fundraising performances.
 *
 * A project-level entity, not a pet field: one gig may raise money for several
 * animals, and the concert series outlives any individual animal's page.
 *
 * Deliberately empty. Nothing has been played yet, so the main page shows the
 * intent and an honest "first performances still to come" state rather than
 * invented events on a page that asks strangers for money. Add real ones here
 * or through the admin as they happen.
 *
 * Shape:
 *   {
 *     slug: 'vake-park-2026-08-15',   // latin, generated from the title
 *     published: true,
 *     date: '2026-08-15',             // ISO; omit if not scheduled yet
 *     sortOrder: 0,                   // ties are broken by date, newest first
 *     title:       { ru: '…', en: '…' },
 *     venue:       { ru: 'Парк Ваке', en: 'Vake Park' },
 *     description: { ru: '…' },       // blank line = new paragraph
 *     link: 'https://…',              // optional: event page, playlist
 *     petSlugs: ['kotik'],            // which animals it raised money for
 *     mainPhoto: { src: '…', thumb: '…', alt: { ru: '…' } },
 *     gallery: [ { type:'image'|'video'|'youtube', … } ]
 *   }
 */
window.GIGS_SEED = [];

/*
 * Site-level copy for the main page: hero, project description, contacts.
 * Stored here rather than hard-coded in index.html so it is translatable the
 * same way pets are, and so schema.sql can move it into the `site_content`
 * table without a rewrite.
 */
window.SITE_CONTENT = {
  hero: {
    image: 'media/kotik-2026-03-12.webp',
    title: {
      ru: 'Помощь уличным животным в Тбилиси',
      en: 'Helping street animals in Tbilisi',
      ka: 'ქუჩის ცხოველების დახმარება თბილისში'
    },
    subtitle: {
      ru: 'Лечение, передержка и поиск дома для тех, у кого нет своего.',
      en: 'Treatment, fostering, and finding homes for those who have none.',
      ka: 'მკურნალობა, დროებითი თავშესაფარი და სახლის პოვნა მათთვის, ვისაც არ აქვს.'
    }
  },
  about: {
    title: {
      ru: 'О проекте',
      en: 'About the project',
      ka: 'პროექტის შესახებ'
    },
    body: {
      ru: 'Это небольшой частный проект: мы находим животных, которым нужна помощь, организовываем эту помощь, оплачиваем лечение и ищем им дом. Каждая карточка — реальное животное, если есть результаты обследования - прилагаются анализы и рекомендации из клиники. Собранные деньги идут на лечение и содержание конкретного подопечного, а документы выкладываются на его странице.\n\nПомочь можно по-разному: перевести любую сумму, забрать животное домой, стать временной передержкой, посетить наше выступление или просто поделиться ссылкой.',
      en: 'This is a small, private project: we find animals that need help, take them to the vet, pay for treatment, and look for homes for them. Every card is a real animal with real test results and real clinic receipts. Donations go directly to the treatment of that specific animal, and the paperwork is published on its page.\n\nThere are many ways to help: donate any amount, adopt, offer temporary fostering, visit our gig, or simply share the link.',
      ka: 'ეს არის მცირე კერძო პროექტი: ვპოულობთ ცხოველებს, რომლებსაც დახმარება სჭირდებათ, მივყავართ ვეტერინართან, ვიხდით მკურნალობის ხარჯებს და სახლს ვუძებნით. ყოველი ბარათი რეალური ცხოველია რეალური ანალიზებითა და კლინიკის ქვითრებით. შემოწირულობები პირდაპირ კონკრეტული ცხოველის მკურნალობას ხმარდება, დოკუმენტები კი მის გვერდზე ქვეყნდება.\n\nდახმარება სხვადასხვანაირად შეიძლება: გადარიცხოთ ნებისმიერი თანხა, აიყვანოთ ცხოველი, გახდეთ დროებითი მასპინძელი ან უბრალოდ გააზიაროთ ბმული.'
    }
  },
  /*
   * Promoted from Kotik's page: the performances raise money for the project,
   * not for one cat, so the statement belongs where every animal benefits
   * from it. Reworded accordingly.
   */
  gigs: {
    title: {
      ru: 'Благотворительные выступления',
      en: 'Charity performances',
      ka: 'საქველმოქმედო გამოსვლები'
    },
    body: {
      ru: 'Я играю на гитаре и пою — и планирую проводить небольшие акустические выступления на улицах и площадках Тбилиси в поддержку наших подопечных. Все собранные на них деньги идут на лечение и содержание животных с этой страницы.\n\nЗдесь будут появляться фото и видео с выступлений, а также анонсы ближайших. Если вы хотите позвать меня сыграть у себя — напишите, я буду рад.',
      en: 'I play guitar and sing, and I plan to give short acoustic performances on the streets and in the venues of Tbilisi in support of the animals we look after. Everything raised goes to their treatment and care.\n\nPhotos and videos from the performances will appear here, along with announcements of upcoming ones. If you would like to invite me to play at your venue, do get in touch.',
      ka: 'ვუკრავ გიტარაზე და ვმღერი — ვგეგმავ მცირე აკუსტიკურ გამოსვლებს თბილისის ქუჩებსა და სივრცეებში ჩვენი ცხოველების მხარდასაჭერად. შეგროვებული თანხა მთლიანად მათ მკურნალობასა და მოვლას ხმარდება.\n\nაქ გამოჩნდება ფოტოები და ვიდეოები გამოსვლებიდან, ასევე უახლოესი გამოსვლების ანონსები. თუ გსურთ დამპატიჟოთ დასაკრავად — მომწერეთ, სიამოვნებით.'
    },
    /* Shown instead of the (currently empty) list of performances. */
    empty: {
      ru: 'Первые выступления ещё впереди. Следите за обновлениями — фото и видео появятся здесь.',
      en: 'The first performances are still ahead. Watch this space — photos and videos will appear here.',
      ka: 'პირველი გამოსვლები ჯერ კიდევ წინაა. თვალი ადევნეთ — ფოტოები და ვიდეოები აქ გამოჩნდება.'
    }
  },

  contacts: {
    title: { ru: 'Контакты', en: 'Contacts', ka: 'კონტაქტი' },
    body: {
      ru: 'Есть вопрос, хотите забрать животное домой или помочь иначе — напишите. Отвечаю на русском, английском и, по мере сил, на грузинском.',
      en: 'Questions, adoption, or another way to help — get in touch. I answer in Russian, English, and — as best I can — Georgian.',
      ka: 'შეკითხვა, ცხოველის აყვანა ან სხვაგვარად დახმარება — მოგვწერეთ. ვპასუხობ რუსულად, ინგლისურად და, რამდენადაც შემიძლია, ქართულად.'
    },
    email: 'innosanctum@gmail.com',
    telegram: 'https://t.me/innosanctum',
    instagram: 'https://www.instagram.com/mserhiievskyi/'
  }
};
