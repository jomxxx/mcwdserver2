CREATE TABLE tappointment (
  appointment_id BIGINT(20) NOT NULL AUTO_INCREMENT,
  appointment_code CHAR(6) NOT NULL COLLATE utf8mb4_general_ci,
  date_selected DATETIME NOT NULL,
  date_validity DATETIME NOT NULL,
  category_code ENUM('REG', 'PRE', 'PWD', 'SNC') NOT NULL COLLATE utf8mb4_general_ci,
  category_description VARCHAR(20) NOT NULL COLLATE utf8mb4_general_ci,
  age INT(11) NOT NULL,
  que_statuscode ENUM('AC', 'EX', 'PD') NOT NULL COLLATE utf8mb4_general_ci,
  que_description VARCHAR(10) NOT NULL COLLATE utf8mb4_general_ci, 
  date_created DATETIME NOT NULL,
  PRIMARY KEY (appointment_id)
);




DELIMITER //

CREATE EVENT UpdateAppointmentStatus
ON SCHEDULE EVERY 1 MINUTE
DO 
BEGIN
    UPDATE tappointment
    SET que_statuscode = 'AC', que_description = 'ACTIVE'
    WHERE date_selected <= NOW() AND que_statuscode = 'PD';

    UPDATE tappointment
    SET que_statuscode = 'EX', que_description = 'EXPIRED'
    WHERE date_validity <= NOW() AND que_statuscode = 'AC';
END //

DELIMITER ;




SET GLOBAL event_scheduler = OFF;
DROP EVENT IF EXISTS UpdateAppointmentStatus;








DELIMITER //

CREATE EVENT UpdateAppointmentStatus
ON SCHEDULE EVERY 1 MINUTE
DO 
BEGIN
    -- Update pending appointments to active
    UPDATE tappointment
    SET que_statuscode = 'AC'
    WHERE date_selected <= NOW() AND que_statuscode = 'PD';

    -- Update active appointments to expired
    UPDATE tappointment
    SET que_statuscode = 'EX'
    WHERE date_validity <= NOW() AND que_statuscode = 'AC';
END //

DELIMITER ;
