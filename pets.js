/*
 * Multi-pet data manifest for the site.
 *
 * To switch from local static data to a free remote DB, set
 * window.PET_DB_CONFIG.remoteEndpoint to a JSON endpoint that returns
 * the same array shape.
 */
window.PET_DB_CONFIG = {
  remoteEndpoint: '' // Example: 'https://example.com/api/pets'
};

window.PET_DATA = [
  {
    slug: 'kotik',
    title: {
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
      ka: 'დაჭირვებულია დახმარება'
    },
    statusType: 'warning',
    tags: ['FIV+', 'Young', 'Tbilisi'],
    mainImage: 'media/kotik-2026-03-12.webp',
    mainAlt: {
      ru: 'Котик спит, свернувшись клубком, на пледе',
      en: 'Kotik curled up asleep on a blanket',
      ka: 'კოტიკს გორგალივით დახვეულს სძინავს საბანზე'
    },
    shortDescription: {
      ru: 'Молодой дворовой кот, которому срочно нужна помощь после диагностики вируса иммунодефицита и воспаления.',
      en: 'A young street cat who needs support after an FIV diagnosis and inflammation treatment.',
      ka: 'ახალგაზრდა ქუჩის კატა, რომელსაც დახმარება სჭირდება FIV-ის დიაგნოზის და ანთებითი პროცესი მკურნალობის შემდეგ.'
    },
    description: {
      ru: 'Котик — молодой, независимый дворовой кот из обычного тбилисского дворика. Он давно пришел за помощью и заботой, но теперь ему нужны лечение, обследование и теплое место, где он не будет контактировать с другими кошками.',
      en: 'Kotik is a young, independent street cat from a typical Tbilisi courtyard. He has come to rely on care, and now he needs treatment, diagnostics, and a safe place where he can stay away from other cats.',
      ka: 'კოტიკი ახალგაზრდა, დამოუკიდებელი ქუჩის კატაა ტრადიციული თბილისის ეზოდან. მან დახმარება და მზრუნველობა დაიმსახურა, ახლა კი სჭირდება მკურნალობა, გამოკვლევა და დაცული ადგილი, სადაც სხვა კატებთან აღარ იქნება.'
    },
    gallery: [
      {
        type: 'image',
        src: 'media/kotik-2026-03-12.webp',
        thumb: 'media/thumbs/kotik-2026-03-12.webp',
        alt: {
          ru: 'Котик спит на пледе',
          en: 'Kotik asleep on a blanket',
          ka: 'კოტიკი საბანზე სძინავს'
        }
      },
      {
        type: 'image',
        src: 'media/kotik-2025-09-08.webp',
        thumb: 'media/thumbs/kotik-2025-09-08.webp',
        alt: {
          ru: 'Котик сидит на деревянном полу',
          en: 'Kotik sitting on a wooden floor',
          ka: 'კოტიკი ხის იატაკზე ზის'
        }
      },
      {
        type: 'image',
        src: 'media/kotik-2025-11-06.webp',
        thumb: 'media/thumbs/kotik-2025-11-06.webp',
        alt: {
          ru: 'Котик спит на кровати рядом с желтой подушкой',
          en: 'Kotik asleep on a bed beside a yellow pillow',
          ka: 'კოტიკი საწოლზე ყვითელი ბალიშის გვერდით სძინავს'
        }
      },
      {
        type: 'image',
        src: 'media/kotik-2026-05-04.webp',
        thumb: 'media/thumbs/kotik-2026-05-04.webp',
        alt: {
          ru: 'Котика держат на руках, он мяукает',
          en: 'Kotik being held in someone’s arms',
          ka: 'კოტიკი ვინმეს ხელშია'
        }
      }
    ],
    video: {
      type: 'youtube',
      id: 'dQw4w9WgXcQ',
      thumb: 'media/thumbs/kotik-2026-03-12.webp'
    },
    curator: {
      name: 'Mikhail',
      email: 'innosanctum@gmail.com',
      telegram: 'https://t.me/innosanctum',
      instagram: 'https://www.instagram.com/mserhiievskyi/'
    },
    docs: [
      {
        label: {
          ru: 'Анализ крови (27.06)',
          en: 'Blood Test (27.06)',
          ka: 'სისხლის ანალიზი (27.06)'
        },
        sub: {
          ru: 'Клиника ZooFamily',
          en: 'ZooFamily Clinic',
          ka: 'კლინიკა ZooFamily'
        },
        href: 'assets/blood_test.png'
      },
      {
        label: {
          ru: 'Назначения врача',
          en: 'Vet prescriptions',
          ka: 'ექიმის დანიშნულება'
        },
        sub: {
          ru: 'Рекомендации',
          en: 'Recommendations',
          ka: 'რეკომენდაციები'
        },
        href: 'assets/vet_recommendation.png'
      }
    ],
    donateLink: 'https://egreve.bog.ge/For_Kotik',
    donateQr: 'assets/qr_code.png'
  },
  {
    slug: 'misha',
    title: {
      ru: 'Миша',
      en: 'Misha',
      ka: 'მიშა'
    },
    subtitle: {
      ru: 'Молодой кот, потерявший дом',
      en: 'Young cat in need of a new home',
      ka: 'ახალგაზრდა კატა, რომელიც ახალ სახლს საჭიროებს'
    },
    location: {
      ru: 'Тбилиси',
      en: 'Tbilisi',
      ka: 'თბილისი'
    },
    status: {
      ru: 'Ищет помощь',
      en: 'Looking for support',
      ka: 'მიზეზად დახმარება'
    },
    statusType: 'info',
    tags: ['Friendly', 'Vaccinated', 'Tbilisi'],
    mainImage: 'media/kotik-2026-05-04a.webp',
    mainAlt: {
      ru: 'Крупный план мордочки кота',
      en: 'Close-up of a cat face',
      ka: 'კატის სახის ახლო ფოტო'
    },
    shortDescription: {
      ru: 'Миша — ласковый кот, который пока живёт на улице и нуждается в доброй семье.',
      en: 'Misha is a gentle cat living outdoors who needs a loving family.',
      ka: 'მიშა მოზომიერი კატაა, რომელიც გარეთ ცხოვრობს და თბილ ოჯახს ეძებს.'
    },
    description: {
      ru: 'Миша появился в одном дворе, но дом его покинул. Он дружелюбен к людям, любит ласку и спокойно относится к детям. Вакцинирован и ищет надёжный дом.',
      en: 'Misha appeared in a courtyard after losing his home. He is friendly with people, loves affection, and is calm around children. Vaccinated and looking for a reliable home.',
      ka: 'მიშა ეზოში გამოჩნდა მას შემდეგ, რაც სახლმა დატოვა. ის ადამიანებზე მეგობრულია, უყვარს ласიკა და ბავშვებთან მშვიდად ურთიერთობს. აცრილია და საიმედო სახლს ეძებს.'
    },
    gallery: [
      {
        type: 'image',
        src: 'media/kotik-2026-05-04a.webp',
        thumb: 'media/thumbs/kotik-2026-05-04a.webp',
        alt: {
          ru: 'Миша смотрит в камеру',
          en: 'Misha looking at the camera',
          ka: 'მიშა კამერას უყურებს'
        }
      },
      {
        type: 'image',
        src: 'media/kotik-2026-05-04.webp',
        thumb: 'media/thumbs/kotik-2026-05-04.webp',
        alt: {
          ru: 'Миша лежит на пледе',
          en: 'Misha resting on a blanket',
          ka: 'მიშა საბანზე მოკალათებული'
        }
      }
    ],
    curator: {
      name: 'Mikhail',
      email: 'innosanctum@gmail.com',
      telegram: 'https://t.me/innosanctum',
      instagram: 'https://www.instagram.com/mserhiievskyi/'
    },
    docs: [],
    donateLink: 'https://egreve.bog.ge/For_Kotik',
    donateQr: 'assets/qr_code.png'
  }
];
