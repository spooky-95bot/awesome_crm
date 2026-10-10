// src/modules/leads/leads-event.listener.ts
// Déclenche les e-mails du flux de réservation Elysence :
// - lead.created → accusé de réception à la cliente + notification à la maison
// - lead.status_changed → QUALIFIED = validation par le responsable → confirmation à la cliente
//
// Tous les e-mails passent par MailService.enqueue() (file idempotente).
// En mode simulated, aucun envoi réel n'a lieu.
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { LeadChannel, LeadStatus } from '@prisma/client';
import { MailService } from '../integrations/mail/mail.service';

interface LeadEventPayload {
  leadId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  channel: LeadChannel;
  source: string | null;
  meta: Record<string, unknown> | null;
  previousStatus?: LeadStatus;
  newStatus?: LeadStatus;
}

@Injectable()
export class LeadsEventListener {
  private readonly logger = new Logger(LeadsEventListener.name);

  constructor(private readonly mail: MailService) {}

  @OnEvent('lead.created')
  async onLeadCreated(payload: LeadEventPayload) {
    // Uniquement les leads provenant du formulaire web Elysence (canal FORM).
    if (payload.channel !== LeadChannel.FORM) return;

    const context = this.buildContext(payload);

    // 1) Accusé de réception à la cliente (si email présent).
    if (payload.email) {
      try {
        await this.mail.enqueue({
          to: payload.email,
          template: 'reservation.received',
          context,
          idempotencyKey: `${payload.leadId}:received`,
          tenantId: 'elysence',
        });
      } catch (err) {
        this.logger.warn(
          `Échec enqueue reservation.received lead=${payload.leadId}: ${err instanceof Error ? err.message : 'unknown'}`,
        );
      }
    }

    // 2) Notification à la maison (adresse configurée via RESEND_FROM ou fallback).
    //    Utilise l'email de la maison comme destinataire interne.
    const adminEmail = process.env.RESERVATION_ADMIN_EMAIL ?? 'maisonelysence@hotmail.com';
    try {
      await this.mail.enqueue({
        to: adminEmail,
        template: 'reservation.admin',
        context,
        idempotencyKey: `${payload.leadId}:admin`,
        tenantId: 'elysence',
      });
    } catch (err) {
      this.logger.warn(
        `Échec enqueue reservation.admin lead=${payload.leadId}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
  }

  @OnEvent('lead.status_changed')
  async onLeadStatusChanged(payload: LeadEventPayload) {
    // Uniquement les leads Elysence (canal FORM).
    if (payload.channel !== LeadChannel.FORM) return;

    // QUALIFIED = le responsable a validé le rendez-vous → envoyer la confirmation.
    if (payload.newStatus !== LeadStatus.QUALIFIED) return;
    if (!payload.email) return;

    const context = this.buildContext(payload);

    try {
      await this.mail.enqueue({
        to: payload.email,
        template: 'reservation.confirmed',
        context,
        idempotencyKey: `${payload.leadId}:confirmed`,
        tenantId: 'elysence',
      });
    } catch (err) {
      this.logger.warn(
        `Échec enqueue reservation.confirmed lead=${payload.leadId}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
  }

  private buildContext(payload: LeadEventPayload): Record<string, unknown> {
    // meta = { formName, fields: { service, date, timeSlot, message, ... } }
    const meta = payload.meta ?? {};
    const fields = (meta.fields as Record<string, unknown>) ?? {};
    return {
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email ?? '',
      phone: payload.phone ?? '',
      service: (fields.service as string) ?? '',
      date: (fields.date as string) ?? '',
      timeSlot: (fields.timeSlot as string) ?? '',
      message: (fields.message as string) ?? '',
    };
  }
}
