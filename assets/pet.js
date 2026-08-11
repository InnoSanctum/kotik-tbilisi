(function () {
    'use strict';

    var ui = window.PET_SITE;
    var currentLang = ui.getLanguage();
    var pet = null;

    function $(selector) {
        return document.querySelector(selector);
    }

    function getQueryParam(name) {
        var search = window.location.search.substring(1);
        var pairs = search.split('&');
        for (var i = 0; i < pairs.length; i++) {
            var parts = pairs[i].split('=');
            if (decodeURIComponent(parts[0]) === name) {
                return decodeURIComponent(parts[1] || '');
            }
        }
        return null;
    }

    function translatePage() {
        var text = ui.translations[currentLang];
        document.getElementById('nav-logo').textContent = text.navLogo;
        document.getElementById('back-link').textContent = text.backLink;
        document.title = (pet && (pet.title[currentLang] || pet.title[ui.FALLBACK_LANG])) + ' | ' + text.navLogo;
    }

    function updateLangButtons() {
        document.querySelectorAll('.lang-btn').forEach(function (button) {
            button.classList.toggle('active', button.dataset.lang === currentLang);
        });
    }

    function renderTags(tags) {
        var container = $('#detail-tags');
        container.textContent = '';
        (tags || []).forEach(function (tag) {
            var el = document.createElement('span');
            el.className = 'tag-pill';
            el.textContent = tag;
            container.appendChild(el);
        });
    }

    function setField(id, value) {
        var el = $(id);
        if (!el) return null;
        el.textContent = value || '';
        return el;
    }

    function renderContactLink(icon, href, label) {
        var a = document.createElement('a');
        a.className = 'contact-link';
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.innerHTML = '<i class="' + icon + '"></i> ' + label;
        return a;
    }

    function renderDocs(docs) {
        var container = $('#docs-grid');
        container.textContent = '';
        (docs || []).forEach(function (doc) {
            var item = document.createElement('a');
            item.className = 'doc-card';
            item.href = doc.href;
            item.target = '_blank';
            item.innerHTML =
                '<i class="fa-solid fa-file-image"></i>' +
                '<div class="doc-card-details">' +
                '<strong>' + (doc.label[currentLang] || doc.label[ui.FALLBACK_LANG] || '') + '</strong>' +
                '<span>' + (doc.sub[currentLang] || doc.sub[ui.FALLBACK_LANG] || '') + '</span>' +
                '</div>';
            container.appendChild(item);
        });
    }

    function renderVideoSection(video) {
        var container = $('#video-section');
        if (!video) {
            container.hidden = true;
            return;
        }
        container.hidden = false;
        var title = container.querySelector('h3');
        title.textContent = ui.translations[currentLang].videoSectionTitle;
        var body = container.querySelector('.video-embed');
        body.textContent = '';

        if (video.type === 'youtube' && video.id) {
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'yt-facade';
            button.style.backgroundImage = 'url("' + (video.thumb || '') + '")';
            button.setAttribute('aria-label', 'Play video');
            var play = document.createElement('span');
            play.className = 'yt-play';
            button.appendChild(play);
            button.addEventListener('click', function () {
                var iframe = document.createElement('iframe');
                iframe.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(video.id) + '?autoplay=1&rel=0';
                iframe.title = 'Video reel';
                iframe.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
                iframe.allowFullscreen = true;
                body.innerHTML = '';
                body.appendChild(iframe);
            });
            body.appendChild(button);
        } else if (video.type === 'video' && video.src) {
            var player = document.createElement('video');
            player.src = video.src;
            player.controls = true;
            player.playsInline = true;
            player.preload = 'metadata';
            if (video.thumb) player.poster = video.thumb;
            body.appendChild(player);
        } else {
            container.hidden = true;
        }
    }

    function renderGallery(gallery) {
        window.KOTIK_MEDIA = Array.isArray(gallery) ? gallery : [];
        window.KotikGallery && window.KotikGallery.setLang(currentLang);
        if (!document.getElementById('gallery-loaded')) {
            var script = document.createElement('script');
            script.id = 'gallery-loaded';
            script.src = 'assets/gallery.js';
            script.defer = true;
            document.body.appendChild(script);
        }
    }

    function renderPet(data) {
        pet = data;
        if (!pet) {
            $('#not-found').hidden = false;
            $('#pet-detail').hidden = true;
            return;
        }

        translatePage();
        updateLangButtons();

        var title = pet.title[currentLang] || pet.title[ui.FALLBACK_LANG] || pet.slug;
        setField('#detail-title', title);
        setField('#detail-subtitle', pet.subtitle[currentLang] || pet.subtitle[ui.FALLBACK_LANG] || '');
        setField('#detail-location', pet.location[currentLang] || pet.location[ui.FALLBACK_LANG] || '');
        var statusEl = setField('#detail-status', pet.status[currentLang] || pet.status[ui.FALLBACK_LANG] || '');
        if (statusEl) {
            statusEl.className = 'tag-pill ' + (pet.statusType === 'warning' ? 'warning' : '');
        }
        setField('#detail-description', pet.description[currentLang] || pet.description[ui.FALLBACK_LANG] || '');
        $('#main-image').src = pet.mainImage || '';
        $('#main-image').alt = pet.mainAlt && (pet.mainAlt[currentLang] || pet.mainAlt[ui.FALLBACK_LANG] || '');
        renderTags(pet.tags || []);

        var contacts = $('#contacts');
        contacts.textContent = '';
        if (pet.curator) {
            if (pet.curator.email) {
                var email = renderContactLink('fa-solid fa-envelope', 'mailto:' + pet.curator.email, pet.curator.email);
                contacts.appendChild(email);
            }
            if (pet.curator.telegram) {
                contacts.appendChild(renderContactLink('fa-brands fa-telegram', pet.curator.telegram, pet.curator.telegram.replace(/^https?:\/\//, '')));
            }
            if (pet.curator.instagram) {
                contacts.appendChild(renderContactLink('fa-brands fa-instagram', pet.curator.instagram, pet.curator.instagram.replace(/^https?:\/\//, '')));
            }
        }

        renderDocs(pet.docs || []);
        renderVideoSection(pet.video);
        renderGallery(pet.gallery || []);

        var donateTitle = $('#donate-title');
        if (donateTitle) {
            donateTitle.innerHTML = '<i class="fa-solid fa-heart"></i> ' + ui.translations[currentLang].donateSectionTitle;
        }
        var donateLink = $('#donate-link');
        if (donateLink) {
            donateLink.href = pet.donateLink || '#';
            donateLink.textContent = ui.translations[currentLang].donateButton;
        }
        var qrImage = $('#donate-qr');
        var qrCaption = $('#qr-caption');
        var qrBlock = $('#donate-qr-block');
        if (qrImage && qrCaption && qrBlock) {
            if (pet.donateQr) {
                qrImage.src = pet.donateQr;
                qrImage.hidden = false;
                qrCaption.textContent = ui.translations[currentLang].qrCaption;
                qrBlock.hidden = false;
            } else {
                qrImage.hidden = true;
                qrCaption.textContent = '';
                qrBlock.hidden = true;
            }
        }
    }

    function onLanguageChange(button) {
        currentLang = button.dataset.lang;
        ui.setLanguage(currentLang);
        updateLangButtons();
        renderPet(pet);
    }

    function init() {
        document.querySelectorAll('.lang-btn').forEach(function (button) {
            button.addEventListener('click', function () { onLanguageChange(button); });
        });

        var slug = getQueryParam('slug');
        ui.loadPetData().then(function (items) {
            var list = Array.isArray(items) ? items : [];
            var selected = list.find(function (item) { return item.slug === slug; });
            renderPet(selected);
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();
