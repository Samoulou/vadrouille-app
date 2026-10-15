RESET ROLE;
--> statement-breakpoint
GRANT vadrouille_fn_coords TO vadrouille_migrator WITH INHERIT FALSE, SET TRUE;
--> statement-breakpoint
SET LOCAL ROLE vadrouille_fn_coords;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.store_prototype_coordinates(uuid, text, double precision, double precision) FROM vadrouille_prototype;
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint
REVOKE vadrouille_fn_coords FROM vadrouille_migrator GRANTED BY vadrouille_migrator;
