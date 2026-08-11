(function () {
    'use strict';

    var ui = window.PET_SITE;
    var currentLang = ui.getLanguage();
    var pets = [];
    var allTags = [];

    function $(selector) {
        return document.querySelector(selector);
    }

    function updateLangButtons() {
        document.querySelectorAll('.lang-btn').forEach(function (button) {
            button.classList.toggle('active', button.dataset.lang === currentLang);
        });
    }

    function translatePage() {
        var text = ui.translations[currentLang];
        document.title = text.homeTitle + ' | ' + text.navLogo;
        document.getElementById('nav-logo').textContent = text.navLogo;
        document.getElementById('page-title').textContent = text.homeTitle;
        document.getElementById('page-subtitle').textContent = text.homeSubtitle;
        document.getElementById('project-description').textContent = text.projectDescription;
        document.getElementById('search-input').placeholder = text.searchPlaceholder;
        document.getElementById('search-label').textContent = text.searchLabel;
    }

    function makeTagButton(tag) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'filter-pill';
        button.textContent = tag;
        button.dataset.tag = tag;
        button.addEventListener('click', function () {
            var input = $('#search-input');
            input.value = tag;
            filterPets();
        });
        return button;
    }

    function renderTagFilters() {
        var container = $('#tag-filters');
        container.textContent = '';
        allTags.forEach(function (tag) {
            container.appendChild(makeTagButton(tag));
        });
    }

    function gatherTags(items) {
        var tags = new Set();
        items.forEach(function (item) {
            (item.tags || []).forEach(function (tag) { tags.add(tag); });
        });
        return Array.from(tags).sort();
    }

    function composeExcerpt(text) {
        if (!text) return '';
        return text.length > 140 ? text.slice(0, 140).trim() + '…' : text;
    }

    function createCard(pet) {
        var title = pet.title[currentLang] || pet.title[ui.FALLBACK_LANG] || pet.slug;
        var subtitle = pet.subtitle[currentLang] || pet.subtitle[ui.FALLBACK_LANG] || '';
        var description = pet.shortDescription && (pet.shortDescription[currentLang] || pet.shortDescription[ui.FALLBACK_LANG]) || '';
        var alt = pet.mainAlt && (pet.mainAlt[currentLang] || pet.mainAlt[ui.FALLBACK_LANG]) || title;
        var tags = (pet.tags || []).map(function (tag) { return '<span class="tag">' + tag + '</span>'; }).join('');
        var card = document.createElement('article');
        card.className = 'pet-card';
        card.innerHTML =
            '<a class="pet-card-link" href="pet.html?slug=' + encodeURIComponent(pet.slug) + '">' +
                '<div class="pet-image"><img src="' + pet.mainImage + '" alt="' + alt + '"></div>' +
                '<div class="pet-body">' +
                    '<div class="pet-title">' +
                        '<h3>' + title + '</h3>' +
                        '<p>' + subtitle + '</p>' +
                    '</div>' +
                    '<div class="tags">' + tags + '</div>' +
                    '<p class="pet-description">' + composeExcerpt(description) + '</p>' +
                '</div>' +
            '</a>';
        return card;
    }

    function renderPetCards(filtered) {
        var list = $('#pet-list');
        list.textContent = '';
        if (!filtered.length) {
            var noResults = document.createElement('div');
            noResults.className = 'notes';
            noResults.textContent = ui.translations[currentLang].noPets;
            list.appendChild(noResults);
            return;
        }
        filtered.forEach(function (pet) {
            list.appendChild(createCard(pet));
        });
    }

    function matchesQuery(pet, query) {
        if (!query) return true;
        query = query.toLowerCase();
        var values = [];
        values.push(pet.slug || '');
        values.push(pet.title && (pet.title[currentLang] || pet.title[ui.FALLBACK_LANG]) || '');
        values.push(pet.subtitle && (pet.subtitle[currentLang] || pet.subtitle[ui.FALLBACK_LANG]) || '');
        values.push(pet.shortDescription && (pet.shortDescription[currentLang] || pet.shortDescription[ui.FALLBACK_LANG]) || '');
        values.push((pet.tags || []).join(' '));
        values.push(pet.status && (pet.status[currentLang] || pet.status[ui.FALLBACK_LANG]) || '');
        return values.some(function (value) { return value.toLowerCase().indexOf(query) !== -1; });
    }

    function filterPets() {
        var query = $('#search-input').value.trim();
        var filtered = pets.filter(function (pet) { return matchesQuery(pet, query); });
        renderPetCards(filtered);
    }

    function onLanguageChange(lang, button) {
        currentLang = lang;
        ui.setLanguage(lang);
        updateLangButtons();
        translatePage();
        renderPetCards(pets);
    }

    function bindEvents() {
        $('#search-input').addEventListener('input', filterPets);
        document.querySelectorAll('.lang-btn').forEach(function (button) {
            button.addEventListener('click', function () {
                onLanguageChange(button.dataset.lang, button);
            });
        });
    }

    function init() {
        translatePage();
        updateLangButtons();
        bindEvents();
        ui.loadPetData().then(function (items) {
            pets = Array.isArray(items) ? items : [];
            allTags = gatherTags(pets);
            renderTagFilters();
            renderPetCards(pets);
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();
