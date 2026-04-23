-- Recover the orphan client created earlier (Bombeiros Montijo)
INSERT INTO public.clients (user_id, nome, nif, tipo_contrato, tarifa_hora, horas_pacote, dias_fecho_automatico)
VALUES ('c2471fa7-d700-43b1-bcca-4395d2460185', 'Bombeiros Montijo', NULL, 'avenca', 25, 48, 7)
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
VALUES ('c2471fa7-d700-43b1-bcca-4395d2460185', 'client')
ON CONFLICT DO NOTHING;