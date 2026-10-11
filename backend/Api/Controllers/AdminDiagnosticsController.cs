using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Api.Common;
using Api.Security;

namespace Api.Controllers;

/// <summary>Диагностика окружения для администратора (без побочных эффектов).</summary>
[ApiController]
[Route("api/v1/admin/diagnostics")]
[Authorize(Roles = "Admin")]
public class AdminDiagnosticsController : ControllerBase
{
    private readonly IConfiguration _configuration;

    public AdminDiagnosticsController(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    /// <summary>
    /// Какой адрес клиента видит API за прокси Railway/Cloudflare. Значения заголовков не отдаются и не логируются,
    /// только число записей цепочки. Как читать результат — docs/Deploy.md, «Проверка IP клиента».
    /// </summary>
    [HttpGet("client-ip")]
    public ActionResult<ApiResponse<ClientIpDiagnostics>> ClientIp()
    {
        Response.Headers.CacheControl = "no-store";
        var ranges = CloudflareClientIp.ParseRanges(_configuration[CloudflareClientIp.ExtraRangesKey]);
        return Ok(ApiResponse<ClientIpDiagnostics>.Ok(ClientIpDiagnostics.Build(HttpContext, ranges)));
    }
}
