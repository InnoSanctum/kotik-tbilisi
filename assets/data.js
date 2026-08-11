(function () {
    'use strict';

    var LANGS = ['ru', 'en', 'ka'];
    var FALLBACK_LANG = 'ru';

    var translations = {
        ru: {
            navLogo: 'Помощь животным',
            homeTitle: 'Помоги нескольким питомцам',
            homeSubtitle: 'Пищевая, медицинская и временная помощь для бездомных кошек и собак в Тбилиси.',
            searchPlaceholder: 'Ищите имя, тег или статус...',
            searchLabel: 'Фильтр по ключевым словам',
            noPets: 'Питомцы не найдены. Попробуйте другой тег или слово.',
            backLink: 'Вернуться к списку питомцев',
            notFound: 'Питомец не найден.',
            projectDescription: 'Здесь представлены животные, которым нужна помощь и поддержка. Нажмите на карточку, чтобы открыть полный профиль, галерею, контакты и документы.',
            adminTitle: 'Админ-панель данных питомцев',
            adminDescription: 'Здесь вы можете редактировать данные питомцев локально и экспортировать JSON для обновления manifest в репозитории.',
            loadRemote: 'Загрузить записи с удалённого источника',
            remoteError: 'Не удалось загрузить данные с сервера, используется локальная копия.',
            copySuccess: 'Содержимое скопировано в буфер обмена.',
            copyError: 'Не удалось скопировать. Скопируйте вручную из поля ниже.',
            formSave: 'Сохранить запись',
            formExport: 'Скопировать манифест',
            descriptionTitle: 'Описание',
            videoSectionTitle: 'Видео / Reel',
            donateSectionTitle: 'Пожертвование',
            donateButton: 'Перевести помощь',
            qrCaption: 'Сканируйте QR-код для перевода напрямую',
            documentsTitle: 'Документы',
            contactsTitle: 'Контакты куратора',
            adminRecordSlug: 'Record slug',
            adminTitleRu: 'Title (RU)',
            adminTitleEn: 'Title (EN)',
            adminTitleKa: 'Title (KA)',
            adminSubtitleRu: 'Subtitle (RU)',
            adminSubtitleEn: 'Subtitle (EN)',
            adminSubtitleKa: 'Subtitle (KA)',
            adminMainImage: 'Main image URL',
            adminTags: 'Tags (comma separated)',
            adminDonateLink: 'Donation link',
            adminDonateQr: 'QR code image URL',
            adminExportHeading: 'Export JSON',
            adminExportInstructions: 'Copy the generated manifest and paste it into pets.js under window.PET_DATA.',
            adminCopyManifest: 'Copy manifest'
        },
        en: {
            navLogo: 'Help Pets',
            homeTitle: 'Support multiple pets',
            homeSubtitle: 'Food, medical care, and shelter support for street animals in Tbilisi.',
            searchPlaceholder: 'Search by name, tag, or status...',
            searchLabel: 'Filter by keyword',
            noPets: 'No animals found. Try another tag or keyword.',
            backLink: 'Back to pet list',
            notFound: 'Pet not found.',
            projectDescription: 'These profiles show animals who need help and support. Click a card to open the full profile, gallery, contacts, and documents.',
            adminTitle: 'Pet data admin panel',
            adminDescription: 'Edit pet records locally and export JSON for updating the repository manifest.',
            loadRemote: 'Load records from remote source',
            remoteError: 'Failed to load remote data, using local copy.',
            copySuccess: 'Copied to clipboard.',
            copyError: 'Copy failed. Please copy manually from the field below.',
            formSave: 'Save record',
            formExport: 'Copy manifest',
            descriptionTitle: 'Description',
            videoSectionTitle: 'Video / Reel',
            donateSectionTitle: 'Donation',
            donateButton: 'Donate',
            qrCaption: 'Scan the QR code to donate directly',
            documentsTitle: 'Documents',
            contactsTitle: 'Curator contacts',
            adminRecordSlug: 'Record slug',
            adminTitleRu: 'Title (RU)',
            adminTitleEn: 'Title (EN)',
            adminTitleKa: 'Title (KA)',
            adminSubtitleRu: 'Subtitle (RU)',
            adminSubtitleEn: 'Subtitle (EN)',
            adminSubtitleKa: 'Subtitle (KA)',
            adminMainImage: 'Main image URL',
            adminTags: 'Tags (comma separated)',
            adminDonateLink: 'Donation link',
            adminDonateQr: 'QR code image URL',
            adminExportHeading: 'Export JSON',
            adminExportInstructions: 'Copy the generated manifest and paste it into pets.js under window.PET_DATA.',
            adminCopyManifest: 'Copy manifest'
        },
        ka: {
            navLogo: 'დახმარება ცხოველებს',
            homeTitle: 'მრავალ ცხოველზე დახმარება',
            homeSubtitle: 'საჭმელი, სამედიცინო დახმარება და თავშესაფარი თბილისის ქუჩის ცხოველებისთვის.',
            searchPlaceholder: 'ძებნეთ სახელი, თეგი ან სტატუსი...',
            searchLabel: 'ფილტრაცია საკვანძო სიტყვით',
            noPets: 'ცხოველები ვერ მოიძებნა. სცადეთ სხვა თეგი ან სიტყვა.',
            backLink: 'დაუბრუნდით ცხოველების სიას',
            notFound: 'ცხოველი ვერ მოიძებნა.',
            projectDescription: 'აქ არის ცხოველები, რომლებსაც დახმარება და მხარდაჭერა სჭირდებათ. დააწკაპუნეთ ბარათზე სრული პროფილის, გალერეის, საკონტაქტო და დოკუმენტების გასახსნელად.',
            adminTitle: 'პეტების მონაცემების ადმინისტრატორი',
            adminDescription: 'ლოკალურად დაარედაქტირეთ პიტების ჩანაწერები და გენერირეთ JSON რეპოზიტორიის manifest-ის განახლებისთვის.',
            loadRemote: 'დამატებითი მონაცემების ჩატვირთვა მანძილიდან',
            remoteError: 'მანძილიდან მონაცემების ჩატვირთვა ვერ მოხერხდა, გამოყენებულია ლოკალური კოპია.',
            copySuccess: 'ჩასმა Clipboard-ში გაიწერა.',
            copyError: 'ჩასმა ვერ მოხერხდა. დააკოპეთ ხელით ქვემოდან.',
            formSave: 'ჩაწერა შენახვა',
            formExport: 'მანიიფესტის კოპირება',
            descriptionTitle: 'აღწერა',
            videoSectionTitle: 'ვიდეო / Reel',
            donateSectionTitle: 'დონაცია',
            donateButton: 'დონაცია',
            qrCaption: 'დაასკანერეთ QR კოდი პირდაპირი გადარიცხვისთვის',
            documentsTitle: 'დოკუმენტები',
            contactsTitle: 'კურატორის კონტაქტები',
            adminRecordSlug: 'Record slug',
            adminTitleRu: 'Title (RU)',
            adminTitleEn: 'Title (EN)',
            adminTitleKa: 'Title (KA)',
            adminSubtitleRu: 'Subtitle (RU)',
            adminSubtitleEn: 'Subtitle (EN)',
            adminSubtitleKa: 'Subtitle (KA)',
            adminMainImage: 'Main image URL',
            adminTags: 'Tags (comma separated)',
            adminDonateLink: 'Donation link',
            adminDonateQr: 'QR code image URL',
            adminExportHeading: 'Export JSON',
            adminExportInstructions: 'Copy the generated manifest and paste it into pets.js under window.PET_DATA.',
            adminCopyManifest: 'Copy manifest'
        }
    };

    function getSavedLang() {
        try { return localStorage.getItem('pet-lang'); } catch (e) { return null; }
    }

    function saveLang(lang) {
        try { localStorage.setItem('pet-lang', lang); } catch (e) {}
    }

    function resolveLang(lang) {
        if (!lang) {
            lang = getSavedLang();
        }
        if (!lang) {
            var nav = (navigator.language || '').slice(0, 2).toLowerCase();
            if (nav === 'ge') nav = 'ka';
            lang = LANGS.includes(nav) ? nav : FALLBACK_LANG;
        }
        return LANGS.includes(lang) ? lang : FALLBACK_LANG;
    }

    function loadPetData() {
        return new Promise(function (resolve) {
            var endpoint = window.PET_DB_CONFIG && window.PET_DB_CONFIG.remoteEndpoint;
            if (!endpoint) {
                resolve(window.PET_DATA || []);
                return;
            }

            fetch(endpoint, { cache: 'no-store' })
                .then(function (response) {
                    if (!response.ok) throw new Error('bad status');
                    return response.json();
                })
                .then(function (items) {
                    if (!Array.isArray(items)) throw new Error('expected array');
                    resolve(items);
                })
                .catch(function () {
                    resolve(window.PET_DATA || []);
                });
        });
    }

    window.PET_SITE = {
        LANGS: LANGS,
        FALLBACK_LANG: FALLBACK_LANG,
        translations: translations,
        getLanguage: resolveLang,
        setLanguage: saveLang,
        loadPetData: loadPetData
    };
})();
