using FluentValidation;

namespace Application.Validators;

/// <summary>Where admin-supplied links and image addresses are allowed to point.</summary>
public static class UrlRules
{
    /// <summary>A same-site path ("/catalog/women"), not a protocol-relative "//host" or "/\host" address,
    /// which a router or browser would treat as another site.</summary>
    public static bool IsSafeInternalPath(string value) =>
        value.StartsWith('/') && !value.StartsWith("//") && !value.StartsWith("/\\");

    public static bool IsHttpUrl(string value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);

    /// <summary>Optional link: empty, an in-app path, or an http(s) URL - never javascript:/data:/protocol-relative.</summary>
    public static bool IsSafeLink(string? value) =>
        string.IsNullOrEmpty(value) || IsSafeInternalPath(value) || IsHttpUrl(value);

    /// <summary>Image address: an http(s) URL or an in-app path (e.g. an upload).</summary>
    public static bool IsSafeImage(string? value) =>
        !string.IsNullOrEmpty(value) && (IsSafeInternalPath(value) || IsHttpUrl(value));

    public static IRuleBuilderOptions<T, string?> MustBeSafeLink<T>(this IRuleBuilder<T, string?> rule) =>
        rule.Must(IsSafeLink).WithMessage("Link must be a relative path or an http(s) URL.");
}
