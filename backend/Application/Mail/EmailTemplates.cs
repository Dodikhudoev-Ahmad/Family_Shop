using System.Net;
using Application.Interfaces;
using Domain.Entities;

namespace Application.Mail;

/// <summary>The three languages of the site. Anything else (or nothing) falls back to Russian.</summary>
public static class EmailLocales
{
    public const string Default = "ru";

    public static string Normalize(string? locale)
    {
        var code = (locale ?? string.Empty).Trim().ToLowerInvariant();
        var dash = code.IndexOfAny(new[] { '-', '_' });
        if (dash > 0)
        {
            code = code[..dash];
        }

        return code is "ru" or "kk" or "en" ? code : Default;
    }
}

/// <summary>Letters for the two e-mail flows in ru / kk / en. HTML has inline styles only: no remote images, no trackers.</summary>
public static class EmailTemplates
{
    private sealed record Strings(string Subject, string Greeting, string Body, string Button, string Fallback, string Ignore);

    private static readonly Dictionary<(EmailTokenPurpose, string), Strings> Texts = new()
    {
        [(EmailTokenPurpose.Confirm, "ru")] = new(
            "Подтвердите email — Family Shop",
            "Здравствуйте, {0}!",
            "Чтобы подтвердить адрес электронной почты, нажмите на кнопку. Ссылка действует 24 часа.",
            "Подтвердить email",
            "Если кнопка не работает, скопируйте ссылку в браузер:",
            "Если вы не регистрировались в Family Shop, просто проигнорируйте это письмо."),
        [(EmailTokenPurpose.Confirm, "kk")] = new(
            "Email мекенжайын растаңыз — Family Shop",
            "Сәлеметсіз бе, {0}!",
            "Электрондық пошта мекенжайын растау үшін батырманы басыңыз. Сілтеме 24 сағат бойы жарамды.",
            "Email растау",
            "Егер батырма жұмыс істемесе, сілтемені браузерге көшіріңіз:",
            "Егер сіз Family Shop-та тіркелмеген болсаңыз, бұл хатты елемей-ақ қойыңыз."),
        [(EmailTokenPurpose.Confirm, "en")] = new(
            "Confirm your email — Family Shop",
            "Hello, {0}!",
            "Press the button to confirm your email address. The link is valid for 24 hours.",
            "Confirm email",
            "If the button does not work, copy this link into your browser:",
            "If you did not sign up at Family Shop, just ignore this message."),
        [(EmailTokenPurpose.Reset, "ru")] = new(
            "Сброс пароля — Family Shop",
            "Здравствуйте, {0}!",
            "Мы получили запрос на смену пароля. Нажмите на кнопку, чтобы задать новый пароль. Ссылка действует 30 минут и работает один раз. После смены пароля вы выйдете со всех устройств.",
            "Задать новый пароль",
            "Если кнопка не работает, скопируйте ссылку в браузер:",
            "Если вы не запрашивали смену пароля, проигнорируйте это письмо — пароль останется прежним."),
        [(EmailTokenPurpose.Reset, "kk")] = new(
            "Құпия сөзді қалпына келтіру — Family Shop",
            "Сәлеметсіз бе, {0}!",
            "Құпия сөзді өзгерту туралы сұраныс алдық. Жаңа құпия сөз орнату үшін батырманы басыңыз. Сілтеме 30 минут жарамды және бір рет қана жұмыс істейді. Құпия сөз өзгергеннен кейін барлық құрылғылардан шығасыз.",
            "Жаңа құпия сөз орнату",
            "Егер батырма жұмыс істемесе, сілтемені браузерге көшіріңіз:",
            "Егер сіз құпия сөзді өзгертуді сұрамаған болсаңыз, бұл хатты елемеңіз — құпия сөз өзгермейді."),
        [(EmailTokenPurpose.Reset, "en")] = new(
            "Reset your password — Family Shop",
            "Hello, {0}!",
            "We received a request to change your password. Press the button to choose a new one. The link is valid for 30 minutes and works once. After the change you will be signed out on all devices.",
            "Set a new password",
            "If the button does not work, copy this link into your browser:",
            "If you did not ask for a password change, ignore this message — your password stays as it is."),
    };

    public static EmailMessage Build(EmailTokenPurpose purpose, string locale, string to, string name, string link)
    {
        var s = Texts[(purpose, EmailLocales.Normalize(locale))];
        var greeting = string.Format(s.Greeting, name.Trim());
        var text = $"{greeting}\n\n{s.Body}\n\n{link}\n\n{s.Ignore}\n\nFamily Shop";

        static string h(string value) => WebUtility.HtmlEncode(value);
        var html = $$"""
            <!doctype html>
            <html lang="{{EmailLocales.Normalize(locale)}}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{h(s.Subject)}}</title></head>
            <body style="margin:0;padding:0;background:#f7f5f3;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1a1a1a;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f3;padding:24px 12px;"><tr><td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px 28px;">
            <tr><td style="font-size:22px;font-weight:700;letter-spacing:.5px;"><span style="color:#a26647;">F</span>amily<span style="color:#a26647;">S</span>hop</td></tr>
            <tr><td style="padding-top:24px;font-size:16px;line-height:1.5;">{{h(greeting)}}</td></tr>
            <tr><td style="padding-top:12px;font-size:16px;line-height:1.5;">{{h(s.Body)}}</td></tr>
            <tr><td style="padding:24px 0;"><a href="{{h(link)}}" style="display:inline-block;background:#a26647;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 28px;border-radius:8px;">{{h(s.Button)}}</a></td></tr>
            <tr><td style="font-size:13px;line-height:1.5;color:#6b6b6b;">{{h(s.Fallback)}}<br><span style="word-break:break-all;">{{h(link)}}</span></td></tr>
            <tr><td style="padding-top:20px;font-size:13px;line-height:1.5;color:#6b6b6b;">{{h(s.Ignore)}}</td></tr>
            </table></td></tr></table></body></html>
            """;

        return new EmailMessage(to, s.Subject, html, text);
    }
}
