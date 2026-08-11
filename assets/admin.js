(function () {
    'use strict';

    var ui = window.PET_SITE;
    var currentLang = ui.getLanguage();
    var entries = [];

    function $(selector) {
        return document.querySelector(selector);
    }

    function translatePage() {
        var text = ui.translations[currentLang];
        document.getElementById('nav-logo').textContent = text.navLogo;
        document.getElementById('admin-title').textContent = text.adminTitle;
        document.getElementById('admin-description').textContent = text.adminDescription;
        document.getElementById('load-remote-label') && (document.getElementById('load-remote-label').textContent = text.loadRemote);
        document.getElementById('label-record-slug').textContent = text.adminRecordSlug;
        document.getElementById('label-record-title-ru').textContent = text.adminTitleRu;
        document.getElementById('label-record-title-en').textContent = text.adminTitleEn;
        document.getElementById('label-record-title-ka').textContent = text.adminTitleKa;
        document.getElementById('label-record-subtitle-ru').textContent = text.adminSubtitleRu;
        document.getElementById('label-record-subtitle-en').textContent = text.adminSubtitleEn;
        document.getElementById('label-record-subtitle-ka').textContent = text.adminSubtitleKa;
        document.getElementById('label-record-main-image').textContent = text.adminMainImage;
        document.getElementById('label-record-tags').textContent = text.adminTags;
        document.getElementById('label-record-donate-link').textContent = text.adminDonateLink;
        document.getElementById('label-record-donate-qr').textContent = text.adminDonateQr;
        document.getElementById('save-record').textContent = text.formSave || 'Save record';
        document.getElementById('copy-manifest').textContent = text.formExport || 'Copy manifest';
    }

    function updateLangButtons() {
        document.querySelectorAll('.lang-btn').forEach(function (button) {
            button.classList.toggle('active', button.dataset.lang === currentLang);
        });
    }

    function renderEntryList() {
        var area = $('#entry-list');
        area.textContent = '';
        entries.forEach(function (pet, index) {
            var item = document.createElement('div');
            item.className = 'admin-entry';
            item.innerHTML = '<strong>' + (pet.slug || 'unnamed') + '</strong>' +
                '<div>' + (pet.title[currentLang] || pet.title[ui.FALLBACK_LANG] || '') + '</div>' +
                '<div class="admin-entry-actions">' +
                    '<button type="button" class="copy-btn" data-index="' + index + '">Edit</button>' +
                '</div>';
            area.appendChild(item);
        });
        area.querySelectorAll('.copy-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                loadRecord(+btn.dataset.index);
            });
        });
    }

    function loadRecord(index) {
        var pet = entries[index];
        if (!pet) return;
        $('#record-slug').value = pet.slug || '';
        $('#record-title-ru').value = pet.title.ru || '';
        $('#record-title-en').value = pet.title.en || '';
        $('#record-title-ka').value = pet.title.ka || '';
        $('#record-subtitle-ru').value = pet.subtitle.ru || '';
        $('#record-subtitle-en').value = pet.subtitle.en || '';
        $('#record-subtitle-ka').value = pet.subtitle.ka || '';
        $('#record-main-image').value = pet.mainImage || '';
        $('#record-tags').value = (pet.tags || []).join(', ');
        $('#record-donate-link').value = pet.donateLink || '';
        $('#record-donate-qr').value = pet.donateQr || '';
    }

    function buildManifest() {
        var header = '// Exported pet manifest. Paste into pets.js replacing window.PET_DATA.
window.PET_DATA = ';
        var json = JSON.stringify(entries, null, 2);
        $('#manifest-output').value = header + json + ';
';
    }

    function saveRecord() {
        var slug = $('#record-slug').value.trim();
        if (!slug) return;
        var found = entries.find(function (pet) { return pet.slug === slug; });
        var record = {
            slug: slug,
            title: {
                ru: $('#record-title-ru').value.trim(),
                en: $('#record-title-en').value.trim(),
                ka: $('#record-title-ka').value.trim()
            },
            subtitle: {
                ru: $('#record-subtitle-ru').value.trim(),
                en: $('#record-subtitle-en').value.trim(),
                ka: $('#record-subtitle-ka').value.trim()
            },
            mainImage: $('#record-main-image').value.trim(),
            tags: $('#record-tags').value.split(',').map(function (tag) { return tag.trim(); }).filter(Boolean),
            donateLink: $('#record-donate-link').value.trim(),
            donateQr: $('#record-donate-qr').value.trim()
        };
        if (found) {
            Object.assign(found, record);
        } else {
            entries.push(record);
        }
        renderEntryList();
        buildManifest();
    }

    function copyOutput() {
        var field = $('#manifest-output');
        field.select();
        try {
            document.execCommand('copy');
            $('#copy-status').textContent = ui.translations[currentLang].copySuccess;
        } catch (e) {
            $('#copy-status').textContent = ui.translations[currentLang].copyError;
        }
    }

    function init() {
        entries = Array.isArray(window.PET_DATA) ? window.PET_DATA.slice() : [];
        translatePage();
        updateLangButtons();
        renderEntryList();
        buildManifest();
        $('#save-record').addEventListener('click', saveRecord);
        $('#copy-manifest').addEventListener('click', copyOutput);
        document.querySelectorAll('.lang-btn').forEach(function (button) {
            button.addEventListener('click', function () {
                currentLang = button.dataset.lang;
                ui.setLanguage(currentLang);
                translatePage();
                updateLangButtons();
            });
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();
