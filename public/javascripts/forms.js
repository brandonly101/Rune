$(document).ready(function() {
    $('form').submit(function() {
        if (typeof $.data(this, "disabledOnSubmit") == 'undefined') {
            $.data(this, "disabledOnSubmit", { submited: true });
            $('input[type=submit], input[type=button]', this).each(function() {
                $(this).attr("disabled", "disabled");
            });
            return true;
        } else {
            return false;
        }
    });
    $('[data-toggle="tooltip"]').tooltip(); 
});
