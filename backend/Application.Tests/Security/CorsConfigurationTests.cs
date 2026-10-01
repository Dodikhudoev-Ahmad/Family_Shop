using Microsoft.Extensions.Configuration;
using Xunit;

namespace Application.Tests.Security;

/// <summary>Local dev origins (Vite 5173, Expo web preview 8081) may only be allowed in Development.</summary>
public class CorsConfigurationTests
{
    private static string[] Origins(params string[] files)
    {
        var builder = new ConfigurationBuilder().SetBasePath(AppContext.BaseDirectory);
        foreach (var file in files) builder.AddJsonFile(file, optional: false);
        return builder.Build().GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();
    }

    [Fact]
    public void Production_AllowsNoLocalhostOrigin()
    {
        var origins = Origins("appsettings.json", "appsettings.Production.json");
        Assert.NotEmpty(origins);
        Assert.All(origins, o => Assert.DoesNotContain("localhost", o, StringComparison.OrdinalIgnoreCase));
        Assert.All(origins, o => Assert.StartsWith("https://", o));
    }

    [Fact]
    public void Development_AllowsTheViteAndExpoWebPreviewOrigins()
    {
        var origins = Origins("appsettings.json", "appsettings.Development.json");
        Assert.Contains("http://localhost:5173", origins);
        Assert.Contains("http://localhost:8081", origins);
    }
}
