using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Api.Common;
using Application.Common;
using Application.DTOs;
using Application.Interfaces;

namespace Api.Controllers;

/// <summary>Управление промокодами для администратора.</summary>
[ApiController]
[Route("api/v1/admin/promo-codes")]
[Authorize(Roles = "Admin")]
public class AdminPromoCodesController : ControllerBase
{
    private readonly IPromoCodeService _promoCodeService;

    public AdminPromoCodesController(IPromoCodeService promoCodeService)
    {
        _promoCodeService = promoCodeService;
    }

    /// <summary>Список промокодов с пагинацией.</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<PromoCodeDto>>>> GetPromoCodes(
        [FromQuery] PromoCodeFilterDto filter,
        CancellationToken cancellationToken = default)
    {
        var result = await _promoCodeService.GetPromoCodesAsync(filter, cancellationToken);
        return Ok(ApiResponse<PagedResult<PromoCodeDto>>.Ok(result));
    }

    /// <summary>Создаёт новый промокод.</summary>
    [HttpPost]
    public async Task<ActionResult<ApiResponse<PromoCodeDto>>> CreatePromoCode(PromoCodeUpsertDto request, CancellationToken cancellationToken)
    {
        var result = await _promoCodeService.CreatePromoCodeAsync(request, cancellationToken);
        return result.IsSuccess
            ? Ok(ApiResponse<PromoCodeDto>.Ok(result.Value!))
            : BadRequest(ApiResponse<PromoCodeDto>.Fail(result.Errors));
    }

    /// <summary>Обновляет существующий промокод.</summary>
    [HttpPut("{id:int}")]
    public async Task<ActionResult<ApiResponse<PromoCodeDto>>> UpdatePromoCode(int id, PromoCodeUpsertDto request, CancellationToken cancellationToken)
    {
        var result = await _promoCodeService.UpdatePromoCodeAsync(id, request, cancellationToken);
        return result.IsSuccess
            ? Ok(ApiResponse<PromoCodeDto>.Ok(result.Value!))
            : BadRequest(ApiResponse<PromoCodeDto>.Fail(result.Errors));
    }

    /// <summary>Удаляет промокод.</summary>
    [HttpDelete("{id:int}")]
    public async Task<ActionResult<ApiResponse<bool>>> DeletePromoCode(int id, CancellationToken cancellationToken)
    {
        var result = await _promoCodeService.DeletePromoCodeAsync(id, cancellationToken);
        return result.IsSuccess
            ? Ok(ApiResponse<bool>.Ok(true))
            : BadRequest(ApiResponse<bool>.Fail(result.Errors));
    }
}
