using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Api.Common;
using Application.DTOs;
using Application.Interfaces;

namespace Api.Controllers;

/// <summary>Управление промо-баннерами для администратора.</summary>
[ApiController]
[Route("api/v1/admin/promo-banners")]
[Authorize(Roles = "Admin")]
public class AdminPromoBannersController : ControllerBase
{
    private readonly IPromoBannerService _promoBannerService;

    public AdminPromoBannersController(IPromoBannerService promoBannerService)
    {
        _promoBannerService = promoBannerService;
    }

    /// <summary>Список всех баннеров (активных и неактивных).</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<PromoBannerDto>>>> GetBanners(CancellationToken cancellationToken)
    {
        var banners = await _promoBannerService.GetAllBannersAsync(cancellationToken);
        return Ok(ApiResponse<IReadOnlyList<PromoBannerDto>>.Ok(banners));
    }

    /// <summary>Создаёт новый баннер.</summary>
    [HttpPost]
    public async Task<ActionResult<ApiResponse<PromoBannerDto>>> CreateBanner(PromoBannerUpsertDto request, CancellationToken cancellationToken)
    {
        var result = await _promoBannerService.CreateBannerAsync(request, cancellationToken);
        return result.IsSuccess
            ? Ok(ApiResponse<PromoBannerDto>.Ok(result.Value!))
            : BadRequest(ApiResponse<PromoBannerDto>.Fail(result.Errors));
    }

    /// <summary>Обновляет существующий баннер.</summary>
    [HttpPut("{id:int}")]
    public async Task<ActionResult<ApiResponse<PromoBannerDto>>> UpdateBanner(int id, PromoBannerUpsertDto request, CancellationToken cancellationToken)
    {
        var result = await _promoBannerService.UpdateBannerAsync(id, request, cancellationToken);
        return result.IsSuccess
            ? Ok(ApiResponse<PromoBannerDto>.Ok(result.Value!))
            : BadRequest(ApiResponse<PromoBannerDto>.Fail(result.Errors));
    }

    /// <summary>Удаляет баннер.</summary>
    [HttpDelete("{id:int}")]
    public async Task<ActionResult<ApiResponse<bool>>> DeleteBanner(int id, CancellationToken cancellationToken)
    {
        var result = await _promoBannerService.DeleteBannerAsync(id, cancellationToken);
        return result.IsSuccess
            ? Ok(ApiResponse<bool>.Ok(true))
            : BadRequest(ApiResponse<bool>.Fail(result.Errors));
    }
}
