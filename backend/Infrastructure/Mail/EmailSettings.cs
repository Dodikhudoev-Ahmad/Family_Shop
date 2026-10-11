namespace Infrastructure.Mail;

/// <summary>
/// The <c>Email</c> configuration section. The key exists only in the environment (<c>Email__ApiKey</c> on Railway, user-secrets
/// locally), never in a file. Without it sending is switched off and the service still starts.
/// </summary>
public sealed record EmailSettings
{
    public const string DefaultFrom = "noreply@familyshop10.kz";
    public const string DefaultApiUrl = "https://api.resend.com/emails";

    public string? ApiKey { get; init; }
    public string From { get; init; } = DefaultFrom;
    public string ApiUrl { get; init; } = DefaultApiUrl;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(ApiKey);

    public static EmailSettings Read(Microsoft.Extensions.Configuration.IConfiguration configuration)
    {
        var section = configuration.GetSection("Email");
        var from = section["From"];
        var url = section["ApiUrl"];
        return new EmailSettings
        {
            ApiKey = section["ApiKey"]?.Trim(),
            From = string.IsNullOrWhiteSpace(from) ? DefaultFrom : from.Trim(),
            ApiUrl = string.IsNullOrWhiteSpace(url) ? DefaultApiUrl : url.Trim()
        };
    }

    // A record prints every member; the key must never appear in a log or an exception message.
    public override string ToString() => $"EmailSettings {{ From = {From}, ApiKey = {(IsConfigured ? "***" : "(not set)")} }}";
}
