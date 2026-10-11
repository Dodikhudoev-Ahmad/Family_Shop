using System.Net;
using Api.Security;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace Application.Tests.Security;

public class ClientIpDiagnosticsTests
{
    private static readonly IReadOnlyList<IPNetwork> Ranges = CloudflareClientIp.ParseRanges(null);

    private static DefaultHttpContext Context(string remote, string scheme = "https")
    {
        var context = new DefaultHttpContext();
        context.Connection.RemoteIpAddress = IPAddress.Parse(remote);
        context.Request.Scheme = scheme;
        return context;
    }

    [Fact]
    public void PlainVisitor_ThroughOneProxyEntry()
    {
        var context = Context("203.0.113.9");
        context.Request.Headers["X-Forwarded-For"] = "203.0.113.9";

        var result = ClientIpDiagnostics.Build(context, Ranges);

        Assert.Equal(new ClientIpDiagnostics("203.0.113.9", 1, false, false, "https"), result);
    }

    [Fact]
    public void ProcessedChain_IsCountedFromTheOriginalHeader()
    {
        // what UseForwardedHeaders leaves behind: the full chain moved to X-Original-For
        var context = Context("203.0.113.9");
        context.Request.Headers["X-Original-For"] = "1.2.3.4, 5.6.7.8, 203.0.113.9";
        context.Request.Headers["X-Forwarded-For"] = "1.2.3.4, 5.6.7.8";

        Assert.Equal(3, ClientIpDiagnostics.Build(context, Ranges).XForwardedForEntries);
    }

    [Fact]
    public void NoForwardingHeaders_MeansZeroEntries_AndTheDirectPeer()
    {
        var result = ClientIpDiagnostics.Build(Context("10.0.0.5", "http"), Ranges);

        Assert.Equal(new ClientIpDiagnostics("10.0.0.5", 0, false, false, "http"), result);
    }

    [Fact]
    public void HonouredCloudflareHeader_IsReportedAsTrusted_EvenThoughRemoteIpIsNowTheVisitor()
    {
        var context = Context("203.0.113.9");
        context.Request.Headers["CF-Connecting-IP"] = "203.0.113.9";
        context.Items[CloudflareClientIp.AppliedItemKey] = true;

        var result = ClientIpDiagnostics.Build(context, Ranges);

        Assert.True(result.CloudflareTrusted);
        Assert.True(result.CfConnectingIpPresent);
    }

    [Fact]
    public void ForgedCloudflareHeader_FromANonCloudflarePeer_IsPresentButNotTrusted()
    {
        var context = Context("203.0.113.9");
        context.Request.Headers["CF-Connecting-IP"] = "9.9.9.9";

        var result = ClientIpDiagnostics.Build(context, Ranges);

        Assert.True(result.CfConnectingIpPresent);
        Assert.False(result.CloudflareTrusted);
        Assert.Equal("203.0.113.9", result.RemoteIp);
    }

    [Fact]
    public void CloudflarePeerWithoutHeader_ShowsTheProxyAddress_AndIsMarkedCloudflare()
    {
        // this is the misconfiguration case the endpoint exists to reveal: remoteIp is a Cloudflare node
        var result = ClientIpDiagnostics.Build(Context("172.70.1.1"), Ranges);

        Assert.True(result.CloudflareTrusted);
        Assert.False(result.CfConnectingIpPresent);
    }

    [Fact]
    public void TheResponse_CarriesNoHeaderValues()
    {
        var context = Context("203.0.113.9");
        context.Request.Headers["X-Forwarded-For"] = "198.51.100.77, 203.0.113.9";
        context.Request.Headers["CF-Connecting-IP"] = "198.51.100.88";

        var json = System.Text.Json.JsonSerializer.Serialize(ClientIpDiagnostics.Build(context, Ranges));

        Assert.DoesNotContain("198.51.100.77", json);
        Assert.DoesNotContain("198.51.100.88", json);
    }

    [Fact]
    public void TheAdminController_IsAdminOnly_AndTheActionIsNotAnonymous()
    {
        var controller = typeof(Api.Controllers.AdminDiagnosticsController);
        var authorize = controller.GetCustomAttributes(typeof(Microsoft.AspNetCore.Authorization.AuthorizeAttribute), true)
            .Cast<Microsoft.AspNetCore.Authorization.AuthorizeAttribute>();

        Assert.Contains(authorize, a => a.Roles == "Admin");
        Assert.Empty(controller.GetMethod("ClientIp")!.GetCustomAttributes(typeof(Microsoft.AspNetCore.Authorization.AllowAnonymousAttribute), true));
    }
}
