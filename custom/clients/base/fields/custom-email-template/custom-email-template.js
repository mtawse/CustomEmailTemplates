/**
 * @author Martin Tawse martin.tawse@thesugarrefinery.com
 * @copyright The Sugar Refinery
 *
 * This handles the selection and parsing of custom email templates
 * This is a global action that may be called form any module
 */

({
    extendsFrom: 'RowactionField',

    /**
     * Custom delimiters used for the parsing
     */
    lDelim: '[[::',
    rDelim: '::]]',
    separator: '::',

    /**
     * This will store necessary related records
     * 'link_name': relatedModule
     */
    relatedEmailTemplateModules: {},

    events: {
        'click a[name=custom-email-template]': "openEmailTemplateSelectionDraw"
    },

    initialize: function (options) {
        this._super('initialize', [options]);
        this.type = 'rowaction';

        _.bindAll(this, 'parseRelatedCollection', 'cloneAttachments');
    },


    /**
     * {@inheritDoc}
     * @private
     */
    _render: function() {
        this._super('_render');
    },


    /**
     * Open the drawer to select the Email Template
     * This should be filtered by Parent Module = current module
     *
     * Once a template has been selected it should be parsed
     * and routed to the Email drawer
     */
    openEmailTemplateSelectionDraw: function() {
        // get the full model, shouldn't need to worry about call backs
        this.model.fetch();
        var self = this;
        var parentModule = this.module;
        var filterOptions = new app.utils.FilterOptions()
            .config({
                'initial_filter': 'filter_by_parent_module',
                'initial_filter_label': 'LBL_PARENT_MODULE',
                'filter_populate': {
                    'parent_module_c': [parentModule]  // @todo Filter Email Template selection-list
                }
            })
            .format();

        app.drawer.open({
                layout: 'selection-list',
                context: {
                    module: 'EmailTemplates',
                    filterOptions: filterOptions,
                    parent: this.context
                }
            },
            // on close, retrieve the full template
            // then route to Email drawer
            function (selectedTemplate) {

                app.alert.show('ParsingTemplate', {level: 'process', title: app.lang.getAppString('LBL_LOADING')});

                self.fetchAttachments(selectedTemplate.id);

                // fetch the full template
                var template = app.data.createBean('EmailTemplates', {id: selectedTemplate.id});
                template.fetch({
                    success: function (template) {
                        self.template = template;
                        // parse the subject and body all at once
                        // so we know in advance what related modules to load
                        self.relatedEmailTemplateModules = {};  // reset this just in case
                        self.parseCustomTemplate(template.get('subject') + ' ' + template.get('body_html'));
                    }
                });
            });
    },

    /**
     * Fetch any attachments for this email template
     *
     * @param {String} templateId
     */
    fetchAttachments: function(templateId) {
        // check for attachments
        // parent_type = 'Emails', parent_id = Email Template ID
        var self = this;
        var attachments = app.data.createBeanCollection('Notes');
        attachments.options = {
            filter: {
                parent_type: 'Emails',
                parent_id: templateId
            }
        };
        attachments.fetch({
            success: function(attachments) {
                self.attachments = attachments.models;
            },
            complete: function() {
                self.fetchedAttachments = true;
            }
        });
    },

    /**
     * Check if we are ready to open the email draw,
     * do any last minute prep
     */
    prepForSend: function() {
        // check if we have fetched all related data including any attachments
        if (!this.fetchedAttachments) {
            return;
        }
        if (this.numRelatedModules !== this.numRelatedModulesFestched) {
            return;
        }

        var options = {};
        options.subject = this.replaceString(this.template.get('subject'));
        options.bodyHtml = this.replaceString(this.template.get('body_html'));
        options.body = this.stripHtml(options.bodyHtml);

        if (this.attachments.length) {
            options.formattedAttachments = this.formatAttachmentsForComposeView(this.attachments)
        }

        this.openEmailDraw(options);
    },

    /**
     * Attachments for the email need to be in a particular format
     *
     * @param {Array} attachments
     * @returns {Array}
     */
    formatAttachmentsForComposeView: function(attachments) {
        var formattedAttachments = [];
        _.each(attachments, function(attachment) {
            var obj = {};
            obj.id = attachment.id;
            obj.name = attachment.get('filename');
            obj.nameForDisplay = attachment.get('filename');
            obj.tag = 'template';
            obj.type = 'template';
            formattedAttachments.push(obj);
        });
        return formattedAttachments;
    },


    /**
     * Open the Email drawer
     * @param {Object} options
     */
    openEmailDraw: function(options) {

        app.alert.dismiss('ParsingTemplate');

        var subject = options.subject || '';
        var bodyHtml = options.bodyHtml || '';
        var body = options.body || '';
        var attachments = options.attachments || [];
        var formattedAttachments = options.formattedAttachments || [];

//        var attachments = this.attachments || [];
        // open the Email window
        app.drawer.open({
            layout: 'compose',
            context: {
                create: true, //7.1.6: never set this to false otherwise you get an empty screen.
                module: 'Emails',
                customAttachments: attachments,  // this is used to ensure that are displayed in the view
                prepopulate: {
                    subject: subject,
                    body: body,
                    html_body: bodyHtml,
                    related: this.model,
                    attachments: formattedAttachments,
                    to_addresses: [{bean: this.model}] // In case the parent module has an email field
                }
            }
        });
    },

    /**
     *
     * @param {String} string
     */
    parseCustomTemplate: function(string) {

        // find all our custom placeholders
        var lDelim = this.lDelim;
        var rDelim = this.rDelim;
        var separator = this.separator;

        this.numRelatedModules = 0;  // number of related modules we're dealing with
        this.numRelatedModulesFestched = 0; // number of related modules we have fetched

        this.replacements = [];
        var regex = new RegExp(this.escapeRegExp(lDelim) + '(.*?)' + this.escapeRegExp(rDelim), 'g');
        var matches = string.match(regex);

        _.each(matches, function(match) {
            /*
             replacement = {
             fullMatch: string,
             fullMatchStripped: string,
             parts: [],
             module: string,
             relatedModule: string,
             link: string,
             field: string,
             value: mixed,
             fieldType: string
             }
             */
            var replacement = this.getEmptyReplacementObject();
            replacement.fullMatch = match;

            // strip our delimiters
            match = match.replace(new RegExp(this.escapeRegExp(lDelim)), '');
            match = match.replace(new RegExp(this.escapeRegExp(rDelim)), '');
            replacement.fullMatchStripped = match;

            // now we need to split our match into constituent parts
            var parts = match.split(separator);
            replacement.parts = parts;

            // we should only have 2 or 3 parts
            // if 2 parts, it's parent_module -> field_name
            // if 3 parts, parent_module -> rel -> field_name
            // if it's ambiguous then return an empty string

            if (parts.length !== 2 && parts.length !== 3) {
                //string = '';
            } else {
                if (parts.length === 2) {
                    replacement.module = this.stripHtml(parts[0]);
                    replacement.field = this.stripHtml(parts[1]);
                }
                if (parts.length === 3) {
                    replacement.module = this.stripHtml(parts[0]);
                    replacement.link = this.stripHtml(parts[1]);
                    // core relationship names are a law unto themselves
                    // confirm what the link name is
                    replacement.link = this.getTrueLinkName(replacement.link);
                    replacement.field = this.stripHtml(parts[2]);
                }
                replacement = this.replacePlaceholder(replacement);
                replacement = this.formatValue(replacement);
                this.replacements.push(replacement);
            }

        }, this);

        // check if we need to fetch related data to complete the parsing
        if (!_.isEmpty(this.relatedEmailTemplateModules)) {
            // fetch related modules
            //this.openEmailDraw();
            for (var key in this.relatedEmailTemplateModules) {
                if (_.has(this.relatedEmailTemplateModules, key)) {
                    var relatedCollection = app.data.createRelatedCollection(this.model, key);
                    relatedCollection.fetch({
                        relate: true,
                        limit: 1, // 1-to-many
                        success: this.parseRelatedCollection
                    });
                }
            }
        } else {
            // go ahead and parse
            this.prepForSend();
        }
    },


    /**
     * Get the field values from related data
     * Update our replacements object
     *
     * @param relatedCollection
     */
    parseRelatedCollection: function(relatedCollection) {
        if (relatedCollection.length) {
            var related = relatedCollection.first();
            _.each(this.replacements, function(replacement, index) {
                if (replacement.relatedModule === related.get('_module')) {
                    this.replacements[index].value = related.get(replacement.field);
                }
            }, this);
        }
        this.numRelatedModulesFestched++;
        this.prepForSend();
    },

    /**
     * Use our replacements array to replace
     * subject/body
     *
     * @param string
     * @returns {*}
     */
    replaceString: function(string) {
        // now lets actually replace the parts
        _.each(this.replacements, function(replacement) {
            string = string.replace(new RegExp(this.escapeRegExp(replacement.fullMatch)), replacement.value);
        }, this);
        return string;
    },


    /**
     * Determine the value for the placeholder
     * And the field type so it can be correctly formatted
     *
     * @param {Object} replacement
     * @return {Object}
     */
    replacePlaceholder: function(replacement) {
        replacement.value = replacement.value || '';
        replacement.fieldType = replacement.fieldType || '';
        // module must be the parent module
        if (replacement.module !== this.module) {
            return replacement;
        }

        if (!replacement.link) {
            // we just need the value from this bean
            // check we recognise the field
            if (!_.has(this.model.fields, replacement.field)) {
                return replacement;
            }

            replacement.value = this.model.get(replacement.field);
            replacement.fieldType = this.model.fields[replacement.field].type;
        } else {
            // load related beans
            if (!_.has(this.relatedEmailTemplateModules, replacement.link)) {
                this.relatedEmailTemplateModules[replacement.link] = app.data.getRelatedModule(replacement.module, replacement.link);
                this.numRelatedModules++; // add a new related module to our count to fetch
            }
            replacement.relatedModule = this.relatedEmailTemplateModules[replacement.link];
            var related = app.data.createBean(replacement.relatedModule);
            replacement.fieldType = related.fields[replacement.field].type;
        }

        return replacement;
    },


    /**
     * Core relationships have their own convention
     * e.g. To go from Opportunities to Accounts, the link
     * name is 'accounts' but the relationship is called 'accounts_opportunities'
     *
     * @param {String} link
     * @returns {String}
     */
    getTrueLinkName: function(link) {
        // loop through our parent model's fields
        // check for field.type="link", field.relationship=link
        // ==> true_link = field.name
        _.each(this.model.fields, function(field) {
            if (field.type === 'link' && field.relationship === link) {
                link = field.name;
            }
        });
        return link;
    },


    /**
     * Format the value according to the field type
     *
     * @param {Object} replacement
     * @return {Object}
     */
    formatValue: function(replacement) {
        replacement.value = replacement.value || '';
        replacement.fieldType = replacement.fieldType || '';

        if (replacement.fieldType) {
            switch (replacement.fieldType) {
                case 'text':
                    // replace line breaks with <br> tags
                    replacement.value = this.convertNL2BR(replacement.value);
                    break;
                case 'enum':
                case 'radioenum':
                    // parse to display value
                    replacement.value = this.convertLangToDisplay(replacement)
                    break;
                case 'multienum':
                    // need to break up the array of values
                    // then convert each as if enum
                    replacement.value = this.convertMultiValuesToDisplay(replacement)
                    break;
                case 'bool':
                    // convert to Yes/No
                    replacement.value = this.convertBoolToString(replacement.value);
                    break;
                case 'relate':
                    // no action required, SUgar parses to the Name of related record
                    break;
                case 'currency':
                    // truncate to 2dp and add symbol
                    replacement.value = this.convertCurrencyToString(replacement.value);
                    break;
                case 'date':
                    // format to user date
                    replacement.value = this.convertToUserDateFormat(replacement.value);
                    break;
                case 'datetimecombo':
                    // format to user datetime
                    replacement.value = this.convertToUserDateTimeFormat(replacement.value);
                    break;
                default:
                    // do nothing, just return the value as is
                    break;
            }
        }

        return replacement;
    },


    /**
     * Escape special characters for regex
     *
     * @param {String} string
     * @returns {String}
     */
    escapeRegExp: function(string) {
        return string.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
    },

    /**
     * Replaces new line characters with <br> tags
     *
     * @param {String} value
     * @returns {String}
     */
    convertNL2BR: function(value) {
        return value.replace(/(?:\r\n|\r|\n)/g, '<br>');
    },

    /**
     * Converts true/false bool to Yes/No
     *
     * @param value
     * @returns {string}
     */
    convertBoolToString: function(value) {
        return (value) ? 'Yes' : 'No';
    },

    /**
     *
     * @param {String} value
     * @return {String} The date formatted to user prefs
     */
    convertToUserDateFormat: function(value) {
        var date = new Date(value);
        var userFormat = app.user.getPreference('datepref');
        return app.date.format(date, userFormat);
    },

    /**
     *
     * @param {String} value
     * @return {String} The datetime formatted to user prefs
     */
    convertToUserDateTimeFormat: function(value) {
        var dateTime = new Date(value);
        var userFormat = app.user.getPreference('datepref') + ' ' + app.user.getPreference('timepref');
        return app.date.format(dateTime, userFormat);
    },

    /**
     * @parem {Object}
     * @return {String}
     */
    convertLangToDisplay: function(replacement) {
        var options = this.getReplacementListOptions(replacement);
        return options[replacement.value];
    },

    /**
     * Array of values converted to comma separated string
     *
     * @param {Object} replacement
     * @returns {string}
     */
    convertMultiValuesToDisplay: function(replacement) {
        var options = this.getReplacementListOptions(replacement);
        for (var i = 0; i < replacement.value.length; i++) {
            replacement.value[i] = options[replacement.value[i]];
        }
        return replacement.value.join(', ');
    },

    /**
     * Truncate to 2 dp and add currency symbol
     *
     * @param {String} value
     * @returns {String}
     */
    convertCurrencyToString: function(value) {
        value = Number(value);  // currency values are stored as a string
        value = value.toFixed(2);
        var currencyId = this.model.get('currency_id');
        var symbol = app.currency.getCurrencySymbol(currencyId);
        return symbol + value;
    },

    /**
     * Get the lang string options
     *
     * @param {Object} replacement
     * @returns {Object}
     */
    getReplacementListOptions: function(replacement) {
        var module = replacement.relatedModule || replacement.module;
        var bean = app.data.createBean(module);
        var optionList = bean.fields[replacement.field].options;
        return app.lang.getAppListStrings(optionList);
    },


    /**
     * Get replacement object with all required properties
     *
     * @returns {Object}
     */
    getEmptyReplacementObject: function() {
        return {
            fullMatch: '',  // full string to match, e.g. [[::tsr_Module::name::]]
            fullMatchStripped: '', // striped of delimiters, e.g. tsr_Module::name
            parts: [], // split by separator, 2 parts for parent module, 3 parts including link to related module
            module: '', // parent module
            relatedModule: '', // any related module
            link: '', // link name to related module
            field: '', // field name
            value: '', // field value
            fieldType: '' // field type
        };
    },

    /**
     * Strip HTML tags form text string
     *
     * @param {String} html
     * @returns {String}
     */
    stripHtml: function(html) {
        var tmp = document.createElement("div");
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || "";
    }
})