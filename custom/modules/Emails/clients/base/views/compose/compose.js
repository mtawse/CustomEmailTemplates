/**
 * @author Martin Tawse martin.tawse@thesugarrefinery.com
 * @copyright The Sugar Refinery
 */
({
    extendsFrom: 'EmailsComposeView',


    initialize: function(options) {
        this._super("initialize", [options]);
    },

    _render: function () {
        this._super("_render");

        console.log("custom email compose");

        if (this.context.get('customAttachments')) {
            var attachments = this.context.get('customAttachments');
            this.insertCustomTemplateAttachments(attachments);
        }
    },


    /**
     * Inserts attachments when custom email template is used
     * attachments field.
     *
     * @param attachments
     */
    insertCustomTemplateAttachments: function(attachments) {
        this.context.trigger("attachments:remove-by-tag", 'template');
        _.each(attachments, function(attachment) {
            var filename = attachment.get('filename');
            this.context.trigger("attachment:add", {
                id: attachment.id,
                name: filename,
                nameForDisplay: filename,
                tag: 'template',
                type: this.ATTACH_TYPE_TEMPLATE
            });
        }, this);
    }
})
