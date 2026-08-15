-- races テーブルにレース番号(1R, 2R...)の列を追加
alter table public.races add column if not exists race_number integer;
